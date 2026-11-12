--[[
	Exiozz Shop — script CLIENT (fenêtre du shop dans le jeu)
	À mettre dans : StarterPlayer → StarterPlayerScripts  (type « LocalScript », nom : ExiozzShopClient)
	La fenêtre est créée entièrement par ce script : rien à construire à la main.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local SITE = "exiozz.github.io/portfolio/shop.html"

local player = Players.LocalPlayer
local remote = ReplicatedStorage:WaitForChild("ExiozzShopRemote")
local event = ReplicatedStorage:WaitForChild("ExiozzShopEvent")

local C = {
	bg = Color3.fromRGB(18, 20, 28),
	card = Color3.fromRGB(28, 31, 42),
	line = Color3.fromRGB(46, 52, 65),
	ink = Color3.fromRGB(237, 239, 245),
	muted = Color3.fromRGB(154, 161, 178),
	accent = Color3.fromRGB(127, 155, 255),
	accentInk = Color3.fromRGB(10, 18, 51),
	ok = Color3.fromRGB(61, 220, 151),
	err = Color3.fromRGB(255, 107, 117),
}

local function make(class, props, parent)
	local inst = Instance.new(class)
	for k, v in pairs(props) do
		inst[k] = v
	end
	inst.Parent = parent
	return inst
end
local function corner(parent, r)
	make("UICorner", { CornerRadius = UDim.new(0, r or 10) }, parent)
end
local function padding(parent, p)
	make("UIPadding", {
		PaddingTop = UDim.new(0, p), PaddingBottom = UDim.new(0, p),
		PaddingLeft = UDim.new(0, p), PaddingRight = UDim.new(0, p),
	}, parent)
end
local function invoke(...)
	local args = { ... }
	local ok, res = pcall(function()
		return remote:InvokeServer((table.unpack or unpack)(args))
	end)
	if not ok or type(res) ~= "table" then
		return { error = "Le shop ne répond pas, réessaie." }
	end
	return res
end
local function frDate(iso)
	local y, m, d = string.match(tostring(iso or ""), "^(%d+)-(%d+)-(%d+)")
	if not y then
		return tostring(iso or "")
	end
	return d .. "/" .. m .. "/" .. y
end

-- Fenêtre ------------------------------------------------------------------
local gui = make("ScreenGui", { Name = "ExiozzShop", ResetOnSpawn = false, IgnoreGuiInset = true }, player:WaitForChild("PlayerGui"))

local panel = make("Frame", {
	AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5),
	Size = UDim2.fromScale(0.92, 0.82), BackgroundColor3 = C.bg, BorderSizePixel = 0,
}, gui)
make("UISizeConstraint", { MaxSize = Vector2.new(460, 540) }, panel)
make("UIStroke", { Color = C.line, Thickness = 1 }, panel)
corner(panel, 16)
padding(panel, 18)
make("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, panel)

local function text(t, size, color, order, bold)
	return make("TextLabel", {
		Text = t, TextSize = size, TextColor3 = color, BackgroundTransparency = 1,
		Font = bold and Enum.Font.GothamBold or Enum.Font.Gotham,
		Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y,
		TextWrapped = true, TextXAlignment = Enum.TextXAlignment.Left, LayoutOrder = order,
	}, panel)
end

text("Exiozz Shop", 24, C.ink, 1, true)
local status = text("Connexion au shop…", 15, C.muted, 2)

local linkRow = make("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 46), LayoutOrder = 3, Visible = false }, panel)
local codeInput = make("TextBox", {
	PlaceholderText = "Ton code (ex : AB12CD)", Text = "", ClearTextOnFocus = false,
	TextSize = 18, Font = Enum.Font.GothamMedium, TextColor3 = C.ink, PlaceholderColor3 = C.muted,
	BackgroundColor3 = C.card, Size = UDim2.new(1, -132, 1, 0),
}, linkRow)
corner(codeInput, 10)
local linkBtn = make("TextButton", {
	Text = "Lier", TextSize = 16, Font = Enum.Font.GothamBold, TextColor3 = C.accentInk, BackgroundColor3 = C.accent,
	AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, 0, 0, 0), Size = UDim2.new(0, 120, 1, 0),
}, linkRow)
corner(linkBtn, 10)

local list = make("ScrollingFrame", {
	BackgroundTransparency = 1, BorderSizePixel = 0, LayoutOrder = 4, Visible = false,
	Size = UDim2.new(1, 0, 1, -190), CanvasSize = UDim2.new(), AutomaticCanvasSize = Enum.AutomaticSize.Y,
	ScrollBarThickness = 4, ScrollBarImageColor3 = C.line,
}, panel)
make("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, list)

local message = text("", 14, C.muted, 5)

local toggle = make("TextButton", {
	Text = "Shop", TextSize = 16, Font = Enum.Font.GothamBold, TextColor3 = C.accentInk, BackgroundColor3 = C.accent,
	Position = UDim2.new(0, 16, 1, -64), Size = UDim2.new(0, 110, 0, 44),
}, gui)
corner(toggle, 12)
toggle.MouseButton1Click:Connect(function()
	panel.Visible = not panel.Visible
end)

local function setMessage(t, color)
	message.Text = t or ""
	message.TextColor3 = color or C.muted
end

-- Logique ------------------------------------------------------------------
local function renderProducts(products)
	for _, child in ipairs(list:GetChildren()) do
		if child:IsA("Frame") then
			child:Destroy()
		end
	end
	if #products == 0 then
		setMessage("Aucune offre configurée pour le moment.", C.muted)
	end
	for i, p in ipairs(products) do
		local row = make("Frame", { BackgroundColor3 = C.card, Size = UDim2.new(1, -6, 0, 60), LayoutOrder = i }, list)
		corner(row, 10)
		padding(row, 10)
		make("TextLabel", {
			Text = p.name, TextSize = 15, Font = Enum.Font.GothamMedium, TextColor3 = C.ink, BackgroundTransparency = 1,
			Size = UDim2.new(1, -136, 1, 0), TextWrapped = true, TextXAlignment = Enum.TextXAlignment.Left,
		}, row)
		local buy = make("TextButton", {
			Text = p.price and ("Acheter · " .. p.price .. " R$") or "Acheter",
			TextSize = 14, Font = Enum.Font.GothamBold, TextColor3 = C.accentInk, BackgroundColor3 = C.accent,
			AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, 0, 0.5, 0), Size = UDim2.new(0, 128, 0, 38),
		}, row)
		corner(buy, 8)
		buy.MouseButton1Click:Connect(function()
			local res = invoke("buy", p.id)
			if res.error then
				setMessage(res.error, C.err)
			end
		end)
	end
end

local function refresh()
	local res = invoke("status")
	if res.error then
		status.Text = res.error
		status.TextColor3 = C.err
		return
	end
	status.TextColor3 = C.muted
	if res.linked then
		local t = "Compte lié à " .. tostring(res.discordName) .. ".\nAchète une offre : ton téléchargement se débloque tout seul sur le site."
		if res.subscribedUntil then
			t = t .. "\nAbonnement actif jusqu'au " .. frDate(res.subscribedUntil) .. "."
		end
		status.Text = t
		linkRow.Visible = false
		list.Visible = true
		renderProducts(res.products or {})
	else
		status.Text = "Pour acheter, lie d'abord ton compte :\n1. Va sur " .. SITE .. " et connecte-toi avec Discord.\n2. Ouvre un asset, choisis R$ puis « Payer en Robux » pour obtenir ton code.\n3. Entre ce code ici :"
		linkRow.Visible = true
		list.Visible = false
	end
end

local busy = false
linkBtn.MouseButton1Click:Connect(function()
	if busy then
		return
	end
	busy = true
	linkBtn.Text = "…"
	local res = invoke("link", codeInput.Text)
	busy = false
	linkBtn.Text = "Lier"
	if res.ok then
		setMessage("Compte lié ! Tu peux acheter.", C.ok)
		refresh()
	else
		setMessage(res.error or "Erreur.", C.err)
	end
end)

event.OnClientEvent:Connect(function(kind, name)
	if kind == "purchased" then
		setMessage("Merci ! « " .. tostring(name) .. " » est débloqué sur le site.", C.ok)
		refresh()
	end
end)

refresh()
