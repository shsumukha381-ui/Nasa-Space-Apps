import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Line, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { STATUS_COLOR, type Status, type SystemId, type SystemState } from './engine';
import './BioTwin.css';

// ---- Tuning knobs ----
const MODEL_URL = '/spacesuit.glb'; // Updated to the new model name
const MODEL_HEIGHT = 3.2;      
const FEET_Y = -1.57;          
const ROTATION_Y = 0;          
const ANCHOR_Z = 0.4;          // Pushed out slightly for the bulkier suit
const DOT_SPREAD = 0.9;       
const HOTSPOT_Y = 0;           
const CAMERA_Z = 5.5;          // Pulled camera back slightly
// ---------------------------------------------------------------------

type Vec3 = [number, number, number];

// ADJUSTED: New hotspot anchors tailored for the spacesuit.glb proportions
const HOTSPOTS: Record<SystemId, { anchor: [number, number]; dotY: number; side: 'left' | 'right' }> = {
  brain:  { anchor: [0.00, 0.90], dotY: 0.93, side: 'right' },
  eyes:   { anchor: [-0.05, 0.85], dotY: 0.93, side: 'left' },
  lungs:  { anchor: [-0.15, 0.70], dotY: 0.70, side: 'left' },
  heart:  { anchor: [0.15, 0.65], dotY: 0.70, side: 'right' },
  immune: { anchor: [-0.15, 0.50], dotY: 0.47, side: 'left' },
  bones:  { anchor: [0.15, 0.25], dotY: 0.27, side: 'right' },
};

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
        if (typeof (mesh as any).applyBoneTransform === 'function') (mesh as any).applyBoneTransform(i, v);
        else if (typeof (mesh as any).boneTransform === 'function') (mesh as any).boneTransform(i, v);
      }
      v.applyMatrix4(mesh.matrixWorld);
      box.expandByPoint(v);
    }
  });
  return box;
}

function Hotspot({ sys, selected, onSelect }: { sys: SystemState; selected: boolean; onSelect: (id: SystemId) => void }) {
  const [hover, setHover] = useState(false);
  const h = HOTSPOTS[sys.id];
  const color = STATUS_COLOR[sys.status];
  const left = h.side === 'left';
  const anchor: Vec3 = [h.anchor[0], h.anchor[1] * MODEL_HEIGHT, ANCHOR_Z];
  const dot: Vec3 = [left ? -DOT_SPREAD : DOT_SPREAD, h.dotY * MODEL_HEIGHT, ANCHOR_Z];
  const showLabel = selected || hover || sys.status !== 'nominal';

  return (
    <>
      {/* FIX: Added click and hover handlers directly to the 3D anchor dot */}
      <mesh 
        position={anchor} 
        renderOrder={10}
        onClick={(e) => { e.stopPropagation(); onSelect(sys.id); }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); setHover(false); document.body.style.cursor = 'default'; }}
      >
        <sphereGeometry args={[0.035, 16, 16]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      
      <Line points={[anchor, dot]} color={color} lineWidth={1.2} transparent opacity={0.75} depthTest={false} />
      
      <Html position={dot} center zIndexRange={[20, 0]}>
        <div className="bt-root">
          <button
            className="bt-btn"
            style={{ borderColor: color, boxShadow: `0 0 12px ${color}` }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(sys.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            aria-label={`${sys.label}: ${sys.status}`}
          >
            {sys.status !== 'nominal' && <span className="bt-ping" style={{ background: color }} />}
            <span className="bt-core" style={{ background: color, transform: selected ? 'scale(1.35)' : 'scale(1)' }} />
          </button>
          {showLabel && (
            <div className={`bt-label ${left ? 'left' : 'right'}`}>
              <span className="bt-tick" style={{ background: color }} />
              <div className="bt-card" style={{ borderColor: color }}>
                <div className="bt-name" style={{ color }}>{sys.label}</div>
                <div className="bt-sub">{Math.round(sys.risk * 100)}% risk · {sys.status}</div>
              </div>
            </div>
          )}
        </div>
      </Html>
    </>
  );
}

interface FigureProps {
  systems: Record<SystemId, SystemState>;
  selected: SystemId | null;
  onSelect: (id: SystemId | null) => void;
  tint: Status;
}

function Figure({ systems, selected, onSelect, tint }: FigureProps) {
  const { scene } = useGLTF(MODEL_URL);
  const sway = useRef<THREE.Group>(null);

  // DELETED: The transparent hologram material override. 
  // We now render the GLTF with its native textures.

  const { model, fit } = useMemo(() => {
    const cloned = SkeletonUtils.clone(scene);
    
    // Add an emissive tint to the whole model based on status, but keep textures
    const baseColor = tint === 'nominal' ? null : STATUS_COLOR[tint];
    
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
         child.frustumCulled = false;
         const mesh = child as THREE.Mesh;
         
         // If there is an alert, give the suit a slight glowing tint of that color
         if (baseColor && mesh.material) {
             const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
             mat.emissive = new THREE.Color(baseColor);
             mat.emissiveIntensity = 0.3;
             mesh.material = mat;
         }
      }
    });
    
    const box = measureRendered(cloned);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    return {
      model: cloned,
      fit: { scale: MODEL_HEIGHT / (size.y || 1), cx: center.x, cz: center.z, minY: box.min.y },
    };
  }, [scene, tint]);

  // Gentle sway
  useFrame(({ clock }) => {
    if (sway.current) sway.current.rotation.y = ROTATION_Y + Math.sin(clock.elapsedTime * 0.4) * 0.12;
  });

  return (
    <group position={[0, FEET_Y, 0]}>
      <group ref={sway}>
        <group scale={fit.scale}>
          <primitive object={model} position={[-fit.cx, -fit.minY, -fit.cz]} />
        </group>
        <group position={[0, HOTSPOT_Y, 0]}>
          {Object.values(systems).map((s) => (
            <Hotspot key={s.id} sys={s} selected={selected === s.id} onSelect={onSelect} />
          ))}
        </group>
      </group>
    </group>
  );
}

interface Props {
  systems: Record<SystemId, SystemState>;
  selected: SystemId | null;
  onSelect: (id: SystemId | null) => void;
  tint: Status;
}

export default function BioTwin({ systems, selected, onSelect, tint }: Props) {
  return (
    <Canvas camera={{ position: [0, 0.1, CAMERA_Z], fov: 45 }} onPointerMissed={() => onSelect(null)}>
      
      {/* UPDATED LIGHTING: Required for rendering opaque, textured models */}
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 5, 5]} intensity={2} />
      <spotLight position={[-5, 5, 5]} angle={0.5} penumbra={1} intensity={1} color="#38bdf8" />
      <spotLight position={[0, -5, 5]} angle={0.5} penumbra={1} intensity={1} color={tint === 'nominal' ? '#ffffff' : STATUS_COLOR[tint]} />

      {/* Ground ring under the feet */}
      <mesh position={[0, FEET_Y + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.85, 0.95, 64]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.45} />
      </mesh>

      <Suspense
        fallback={
          <Html center>
            <div className="bt-loading">LOADING 3D BIO-TWIN...</div>
          </Html>
        }
      >
        <Html position={[0, -5, 0]}><span /></Html>
        <Figure systems={systems} selected={selected} onSelect={onSelect} tint={tint} />
      </Suspense>

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minAzimuthAngle={-Math.PI / 4}
        maxAzimuthAngle={Math.PI / 4}
        minPolarAngle={1.1}
        maxPolarAngle={1.8}
      />
    </Canvas>
  );
}

useGLTF.preload(MODEL_URL);