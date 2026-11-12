--[[
	Exiozz Shop — script SERVEUR
	À mettre dans : ServerScriptService  (type « Script », nom : ExiozzShop)

	Avant de publier :
	  1. Game Settings → Security → « Allow HTTP Requests » : ON
	  2. Remplis CONFIG ci-dessous (adresse du serveur, clé du jeu, Developer Products)
	  3. Ce jeu doit être dédié au shop : Roblox n'autorise qu'un seul ProcessReceipt par jeu.

	Ce script n'est jamais envoyé aux joueurs : la clé du jeu reste secrète.
]]

local CONFIG = {
	-- Adresse de ton serveur Replit (sans / à la fin)
	API_URL = "https://TON-SERVEUR.replit.app",

	-- Même valeur que le secret ROBLOX_GAME_KEY dans Replit
	GAME_KEY = "COLLE_ICI_LA_CLE_DU_JEU",

	-- Un Developer Product par offre.
	-- [ID du Developer Product] = { assetId = "id de l'asset dans shop.html", offer = "single" | "pass" | "subscription", name = "texte affiché" }
	PRODUCTS = {
		-- [1234567890] = { assetId = "modern-school-ui", offer = "single", name = "UI Kit — Achat simple (v1.0)" },
		-- [1234567891] = { assetId = "modern-school-ui", offer = "pass",   name = "UI Kit — Pass mises à jour" },
		-- [1234567892] = { offer = "subscription", name = "Abonnement total — 30 jours" },
	},
}

local HttpService = game:GetService("HttpService")
local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local remote = Instance.new("RemoteFunction")
remote.Name = "ExiozzShopRemote"
remote.Parent = ReplicatedStorage

local event = Instance.new("RemoteEvent")
event.Name = "ExiozzShopEvent"
event.Parent = ReplicatedStorage

-- Appel au serveur du shop. Renvoie (succès, données)
local function api(method, path, body)
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = CONFIG.API_URL .. path,
			Method = method,
			Headers = {
				["Content-Type"] = "application/json",
				["X-Game-Key"] = CONFIG.GAME_KEY,
			},
			Body = body and HttpService:JSONEncode(body) or nil,
		})
	end)
	if not ok then
		warn("[ExiozzShop] Requête impossible :", res)
		return false, { error = "Serveur du shop injoignable, réessaie dans un instant." }
	end
	local data = {}
	pcall(function()
		data = HttpService:JSONDecode(res.Body)
	end)
	if type(data) ~= "table" then
		data = {}
	end
	return res.Success, data
end

-- Liste des offres avec leur prix réel en Robux (mise en cache)
local productList = nil
local function getProducts()
	if productList then
		return productList
	end
	local list = {}
	for id, p in pairs(CONFIG.PRODUCTS) do
		local price = nil
		local ok, info = pcall(function()
			return MarketplaceService:GetProductInfo(id, Enum.InfoType.Product)
		end)
		if ok and info then
			price = info.PriceInRobux
		end
		table.insert(list, { id = id, name = p.name, offer = p.offer, price = price })
	end
	table.sort(list, function(a, b)
		return a.name < b.name
	end)
	productList = list
	return list
end

local linked = {}
local lastLinkTry = {}

remote.OnServerInvoke = function(player, action, arg)
	if action == "status" then
		local ok, data = api("GET", "/api/roblox/player/" .. player.UserId)
		if not ok then
			return { error = data.error or "Serveur du shop indisponible." }
		end
		linked[player.UserId] = data.linked == true
		return {
			linked = data.linked == true,
			discordName = data.discordName,
			subscribedUntil = data.subscribedUntil,
			products = getProducts(),
		}
	elseif action == "link" then
		local now = os.clock()
		if lastLinkTry[player.UserId] and now - lastLinkTry[player.UserId] < 3 then
			return { error = "Attends quelques secondes avant de réessayer." }
		end
		lastLinkTry[player.UserId] = now
		local code = (string.upper(tostring(arg or "")):gsub("%s", ""))
		local ok, data = api("POST", "/api/roblox/link", {
			code = code,
			robloxUserId = player.UserId,
			robloxName = player.Name,
		})
		if ok then
			linked[player.UserId] = true
			return { ok = true, discordName = data.discordName }
		end
		return { error = data.error or "Code invalide." }
	elseif action == "buy" then
		local id = tonumber(arg)
		if not id or not CONFIG.PRODUCTS[id] then
			return { error = "Offre inconnue." }
		end
		if not linked[player.UserId] then
			return { error = "Lie d'abord ton compte avec ton code du site." }
		end
		MarketplaceService:PromptProductPurchase(player, id)
		return { ok = true }
	end
	return { error = "Action inconnue." }
end

-- Appelé par Roblox après chaque achat : on prévient le serveur du shop.
-- Tant que le serveur n'a pas confirmé, Roblox réessaiera plus tard (le joueur ne perd rien).
MarketplaceService.ProcessReceipt = function(receipt)
	local p = CONFIG.PRODUCTS[receipt.ProductId]
	if not p then
		warn("[ExiozzShop] Developer Product inconnu :", receipt.ProductId)
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local ok, data = api("POST", "/api/roblox/purchase", {
		purchaseId = receipt.PurchaseId,
		robloxUserId = receipt.PlayerId,
		assetId = p.assetId,
		offer = p.offer,
		robux = receipt.CurrencySpent,
	})
	if not ok then
		warn("[ExiozzShop] Achat pas encore enregistré :", data.error)
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local player = Players:GetPlayerByUserId(receipt.PlayerId)
	if player then
		event:FireClient(player, "purchased", p.name)
	end
	return Enum.ProductPurchaseDecision.PurchaseGranted
end

Players.PlayerRemoving:Connect(function(player)
	linked[player.UserId] = nil
	lastLinkTry[player.UserId] = nil
end)
