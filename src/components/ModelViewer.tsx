"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage, useGLTF } from "@react-three/drei";

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

export default function ModelViewer({ url }: { url: string }) {
  return (
    <Canvas dpr={[1, 2]} shadows camera={{ fov: 45 }}>
      <Stage intensity={0.5} environment="city">
        <Model url={url} />
      </Stage>
      <OrbitControls makeDefault />
    </Canvas>
  );
}