"use client";

import { useState } from "react";
import { Flex, Button, Grid, Media } from "@once-ui-system/core";
import { gallery } from "@/resources";
// On importe le composant 3D que nous avons créé
import ModelViewer from "@/components/ModelViewer";

export default function GalleryView() {
  const [activeCategory, setActiveCategory] = useState("Tous");

  const categories = [
    "Tous", 
    ...Array.from(new Set(gallery.images.map((img) => img.category).filter(Boolean)))
  ] as string[];

  const filteredItems = activeCategory === "Tous" 
    ? gallery.images 
    : gallery.images.filter((img) => img.category === activeCategory);

  return (
    <Flex direction="column" gap="32" fillWidth>
      {/* Barre de boutons */}
      <Flex gap="12" wrap>
        {categories.map((cat) => (
          <Button 
            key={cat} 
            variant={activeCategory === cat ? "primary" : "secondary"}
            onClick={() => setActiveCategory(cat)}
            label={cat}
          />
        ))}
      </Flex>

      {/* Grille dynamique */}
      <Grid columns="3" gap="16" fillWidth>
        {filteredItems.map((item, index) => (
          <div key={`${item.src}-${index}`} style={{ width: '100%' }}>
            {item.type === "model" ? (
              // Ici, on remplace le texte statique par ton visualiseur 3D
              <div style={{ height: '250px', width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
                <ModelViewer url={item.src} />
              </div>
            ) : (
              <Media 
                src={item.src} 
                alt={item.alt} 
                aspectRatio={item.orientation === "horizontal" ? "16/9" : "9/16"}
                radius="l"
              />
            )}
          </div>
        ))}
      </Grid>
    </Flex>
  );
}