import { Suspense, useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

// Camera is at z=5 with fov 45, so the viewport shows ~4.14 world units vertically
// (from -2.07 at the bottom edge to +2.07 at the top edge).
const VISIBLE_HALF = 2.07;
// Height of the hologram in world units. Lower = smaller.
const TARGET_HEIGHT = 3.2;
// Gap between the feet and the bottom edge of the viewport, in world units
// (~0.3 is about 50px in a tall panel). Raise to lift the hologram, lower to drop it.
const FEET_MARGIN = 0.5;
// World Y of the feet.
const FEET_Y = -VISIBLE_HALF + FEET_MARGIN;

interface HumanProps {
  critical: boolean;
  onPartClick: (part: string) => void;
}

/**
 * Bounding box of what is actually RENDERED. For skinned models the default
 * Box3.setFromObject() uses the bind-pose geometry, which can be very different
 * from the deformed mesh on screen, so we run every vertex through the skeleton.
 */
function measureRendered(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();

  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!(mesh as any).isMesh) return;
    const pos = mesh.geometry.attributes.position;
    if (!pos) return;

    const skinned = (mesh as any).isSkinnedMesh === true;
    if (skinned) mesh.skeleton.update();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (skinned) {
        // method was renamed between three.js versions
        if (typeof (mesh as any).applyBoneTransform === 'function') (mesh as any).applyBoneTransform(i, v);
        else if (typeof (mesh as any).boneTransform === 'function') (mesh as any).boneTransform(i, v);
      }
      v.applyMatrix4(mesh.matrixWorld);
      box.expandByPoint(v);
    }
  });

  return box;
}

const HologramAstronaut = ({ critical, onPartClick }: HumanProps) => {
  const { scene } = useGLTF('/astronaut.glb');
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  // One shared hologram material; colour/hover are updated in place (below)
  // so the model is never re-cloned.
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        wireframe: true,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
      }),
    []
  );

  useEffect(() => {
    const base = critical ? '#ef4444' : '#38bdf8';
    material.color.set(base);
    material.emissive.set(hovered ? '#ffffff' : base);
    material.emissiveIntensity = hovered ? 1.5 : 0.8;
  }, [material, critical, hovered]);

  // Clone with SkeletonUtils (a plain .clone() leaves skinned meshes bound to the
  // ORIGINAL bones), apply the hologram material, then measure what is rendered.
  const { model, fit } = useMemo(() => {
    const cloned = SkeletonUtils.clone(scene);
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).material = material;
        child.frustumCulled = false; // skinned bounds can be stale; never cull
      }
    });

    const box = measureRendered(cloned);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    console.log('[BioTwin] rendered model size', size.toArray().map((n) => +n.toFixed(3)), 'min.y', +box.min.y.toFixed(3));

    return {
      model: cloned,
      fit: { scale: TARGET_HEIGHT / (size.y || 1), cx: center.x, cz: center.z, minY: box.min.y },
    };
  }, [scene, material]);

  useFrame(() => {
    if (groupRef.current) groupRef.current.rotation.y += 0.005;
  });

  return (
    // Outer group fixes the feet at FEET_Y; inner group spins and scales.
    <group position={[0, FEET_Y, 0]}>
      <group
        ref={groupRef}
        scale={fit.scale}
        onClick={(e: any) => {
          e.stopPropagation();
          // 0 (feet) -> 1 (head), measured against the model's own rendered height.
          const local = groupRef.current!.worldToLocal(e.point.clone());
          const frac = local.y / (TARGET_HEIGHT / fit.scale);
          if (frac > 0.78) {
            onPartClick("Neuro-Ocular (Eyes & Brain)");
          } else if (frac > 0.45) {
            onPartClick("Cardiopulmonary (Heart & Lungs)");
          } else {
            onPartClick("Musculoskeletal (Bones & Muscles)");
          }
        }}
        onPointerOver={(e: any) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'crosshair';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        <primitive object={model} position={[-fit.cx, -fit.minY, -fit.cz]} />
      </group>
    </group>
  );
};

export default function HumanModel({ critical, onPartClick }: HumanProps) {
  return (
    <Canvas camera={{ position: [0, 0, 5.0], fov: 45 }}>
      <ambientLight intensity={0.6} />
      <spotLight position={[10, 10, 10]} angle={0.2} penumbra={1} intensity={critical ? 4 : 2} color={critical ? "#ef4444" : "#38bdf8"} />
      
      <Suspense fallback={
        <Html center>
          <div style={{ color: '#38bdf8', fontFamily: 'monospace', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            LOADING 3D BIO-TWIN...
          </div>
        </Html>
      }>
        <HologramAstronaut critical={critical} onPartClick={onPartClick} />
      </Suspense>
      <OrbitControls enableZoom={false} enablePan={false} />
    </Canvas>
  );
}

useGLTF.preload('/astronaut.glb');
