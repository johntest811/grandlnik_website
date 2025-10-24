"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
// Replace three-stdlib with official examples (version-matched to `three`)
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

type Props = {
  fbxUrls: string[];
  width?: number;
  height?: number;
};

export default function ThreeDFBXViewer({ fbxUrls, width = 1200, height = 700 }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [weather, setWeather] = useState<"sunny" | "rainy" | "windy" | "foggy">("sunny");
  const [currentFbxIndex, setCurrentFbxIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // Ensure we have valid FBX URLs and current index
  const validFbxUrls = Array.isArray(fbxUrls) ? fbxUrls.filter(url => url && url.trim() !== '') : [];
  const currentFbx = validFbxUrls[currentFbxIndex] || validFbxUrls[0];

  // Navigation functions
  const goToPrevious = () => {
    if (validFbxUrls.length > 1) {
      setCurrentFbxIndex((prev) => (prev > 0 ? prev - 1 : validFbxUrls.length - 1));
    }
  };

  const goToNext = () => {
    if (validFbxUrls.length > 1) {
      setCurrentFbxIndex((prev) => (prev < validFbxUrls.length - 1 ? prev + 1 : 0));
    }
  };

  const goToIndex = (index: number) => {
    if (index >= 0 && index < validFbxUrls.length) {
      setCurrentFbxIndex(index);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (validFbxUrls.length <= 1) return;
      
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight':
          event.preventDefault();
          goToNext();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [validFbxUrls.length]);

  useEffect(() => {
    if (!mountRef.current || !currentFbx) return;

    setLoading(true);

    // Enhanced adaptive performance helpers
    const hwConcurrency = (navigator as any).hardwareConcurrency || 4;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const performanceFactor = Math.min(1, hwConcurrency / 4) * (1 / dpr);
    
    // Detect if running on lower-end hardware
    const isLowEnd = hwConcurrency < 4 || performanceFactor < 0.5;
    const detailLevel = isLowEnd ? 0.5 : (performanceFactor > 0.8 ? 1.0 : 0.75);

    // particle budgets (scaled)
    const BASE_RAIN = Math.round(8000 * performanceFactor);
    const STORM_RAIN = Math.round(22000 * performanceFactor);
    const BASE_WIND = Math.round(300 * performanceFactor);
    const STRONG_WIND = Math.round(600 * performanceFactor);

    // rendering size - use container size if available
    const container = mountRef.current;
    const renderWidth = Math.floor(container.clientWidth || width);
    const renderHeight = Math.floor(container.clientHeight || height);

    // clear previous children
    while (container.firstChild) container.removeChild(container.firstChild);

    // scene + camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    const camera = new THREE.PerspectiveCamera(50, renderWidth / renderHeight, 0.1, 2000);
    
    // Enhanced renderer with better shadow and reflection settings
    const renderer = new THREE.WebGLRenderer({ 
      antialias: !isLowEnd,
      alpha: false,
      powerPreference: isLowEnd ? "low-power" : "high-performance",
      logarithmicDepthBuffer: !isLowEnd, // Better depth precision for shadows
      preserveDrawingBuffer: false,
      premultipliedAlpha: false
    });
    renderer.setSize(renderWidth, renderHeight);
    renderer.setPixelRatio(Math.min(dpr, isLowEnd ? 1 : 2));
    
    // ENHANCED SHADOW CONFIGURATION
    renderer.shadowMap.enabled = true;
    if (!isLowEnd) {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows
      renderer.shadowMap.autoUpdate = true;
    } else {
      renderer.shadowMap.type = THREE.BasicShadowMap; // Performance mode
    }

    // runtime-safe color management
    const setOutputCS = (r: any) => {
      const anyTHREE: any = THREE;
      if ("outputColorSpace" in r && anyTHREE.SRGBColorSpace !== undefined) {
        r.outputColorSpace = anyTHREE.SRGBColorSpace;
      } else if ("outputEncoding" in r && anyTHREE.sRGBEncoding !== undefined) {
        r.outputEncoding = anyTHREE.sRGBEncoding;
      }
    };
    setOutputCS(renderer);

    if ("physicallyCorrectLights" in renderer) try { (renderer as any).physicallyCorrectLights = true; } catch(e){}

    // Enhanced tone mapping for better reflections
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2; // Slightly increased exposure for better reflections
    container.appendChild(renderer.domElement);

    // controls - set up for center focus
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.enableRotate = true;

    // Enhanced lighting setup for realistic shadows and reflections
    const ambient = new THREE.AmbientLight(0xffffff, 0.4); // Reduced ambient for better shadow contrast
    scene.add(ambient);

    // PRIMARY SHADOW-CASTING LIGHT (Main directional light)
    const sunLight = new THREE.DirectionalLight(0xfff1c0, 2.0); // Increased intensity
    sunLight.position.set(100, 150, 50); // Higher position for better shadows
    sunLight.castShadow = true;
    
    // ENHANCED SHADOW SETTINGS
    const shadowMapSize = isLowEnd ? 1024 : (detailLevel > 0.75 ? 4096 : 2048);
    sunLight.shadow.mapSize.width = shadowMapSize;
    sunLight.shadow.mapSize.height = shadowMapSize;
    sunLight.shadow.camera.near = 0.1;
    sunLight.shadow.camera.far = 1000;
    sunLight.shadow.camera.left = -200;
    sunLight.shadow.camera.right = 200;
    sunLight.shadow.camera.top = 200;
    sunLight.shadow.camera.bottom = -200;
    sunLight.shadow.bias = -0.0001; // Reduced shadow acne
    sunLight.shadow.normalBias = 0.02; // Better shadow quality
    sunLight.shadow.radius = isLowEnd ? 2 : 8; // Soft shadow radius
    scene.add(sunLight);

    // SECONDARY SHADOW-CASTING LIGHT for fill lighting
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    fillLight.position.set(-80, 100, 80);
    fillLight.castShadow = !isLowEnd; // Only on high-end devices
    if (!isLowEnd) {
      fillLight.shadow.mapSize.width = 1024;
      fillLight.shadow.mapSize.height = 1024;
      fillLight.shadow.camera.near = 0.1;
      fillLight.shadow.camera.far = 500;
      fillLight.shadow.camera.left = -100;
      fillLight.shadow.camera.right = 100;
      fillLight.shadow.camera.top = 100;
      fillLight.shadow.camera.bottom = -100;
      fillLight.shadow.bias = -0.0002;
      fillLight.shadow.normalBias = 0.015;
      fillLight.shadow.radius = 4;
    }
    scene.add(fillLight);

    // RIM LIGHTING for enhanced reflections
    if (!isLowEnd) {
      const rimLight1 = new THREE.DirectionalLight(0xccddff, 0.8);
      rimLight1.position.set(0, 50, -150);
      scene.add(rimLight1);

      const rimLight2 = new THREE.DirectionalLight(0xffeecc, 0.6);
      rimLight2.position.set(150, 80, 0);
      scene.add(rimLight2);
    }

    // Enhanced hemisphere light for better ambient reflections
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemi.position.set(0, 200, 0);
    scene.add(hemi);

    // Enhanced particle textures
    const createRainTexture = () => {
      const size = 32;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, size, size);
      const grd = ctx.createLinearGradient(size / 2, 0, size / 2, size);
      grd.addColorStop(0, "rgba(255,255,255,0.98)");
      grd.addColorStop(0.6, "rgba(200,200,255,0.5)");
      grd.addColorStop(1, "rgba(200,200,255,0.05)");
      ctx.fillStyle = grd;
      ctx.fillRect(size / 2 - 1, 0, 2, size);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    };

    const createWindTexture = () => {
      const size = 32;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, size, size);
      
      const grd = ctx.createLinearGradient(0, size/2, size, size/2);
      grd.addColorStop(0, "rgba(220,230,255,0.0)");
      grd.addColorStop(0.3, "rgba(200,220,255,0.6)");
      grd.addColorStop(0.7, "rgba(180,200,255,0.8)");
      grd.addColorStop(1, "rgba(160,180,255,0.0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, size/2 - 2, size, 4);
      
      ctx.strokeStyle = "rgba(190,210,255,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, size/2 - 1);
      ctx.quadraticCurveTo(size/2, size/2 + 2, size, size/2 - 1);
      ctx.stroke();
      
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    };

    const rainTexture = createRainTexture();
    const windTexture = createWindTexture();

    // particle holders
    let rainSystem: THREE.Points | null = null;
    let rainVelY: Float32Array | null = null;
    let rainVelX: Float32Array | null = null;
    let rainBaseOpacity = 0.6;
    let windSystem: THREE.Points | null = null;
    let windVel: Float32Array | null = null;
    let windLifetime: Float32Array | null = null;
    let windBaseOpacity = 0.3;
    let modelBounds: THREE.Box3 | null = null;

    // ENHANCED ENVIRONMENT MAPPING FOR REFLECTIONS
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(isLowEnd ? 256 : 512, { 
      generateMipmaps: true, 
      minFilter: THREE.LinearMipmapLinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });
    const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
    cubeCamera.position.set(0, 0, 0);
    scene.add(cubeCamera);
    
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    // frame counter
    let frameCounter = 0;

    const applyWeather = (type: string) => {
      // cleanup previous weather effects
      if (rainSystem) {
        try {
          scene.remove(rainSystem);
          rainSystem.geometry.dispose();
          (rainSystem.material as THREE.PointsMaterial).dispose();
        } catch (e) {}
        rainSystem = null;
        rainVelY = null;
        rainVelX = null;
      }
      if (windSystem) {
        try {
          scene.remove(windSystem);
          windSystem.geometry.dispose();
          (windSystem.material as THREE.PointsMaterial).dispose();
        } catch (e) {}
        windSystem = null;
        windVel = null;
        windLifetime = null;
      }
      scene.fog = null;

      if (type === "sunny") {
        scene.background = new THREE.Color(0x87ceeb);
        ambient.intensity = 0.4;
        sunLight.intensity = 2.0;
        renderer.setClearColor(0x87ceeb, 1);
      } else if (type === "rainy") {
        scene.background = new THREE.Color(0xbfd1e5);
        ambient.intensity = 0.3;
        sunLight.intensity = 0.8;
        renderer.setClearColor(0xbfd1e5, 1);

        const rainCount = performanceFactor > 0.6 ? STORM_RAIN : BASE_RAIN;
        const positions = new Float32Array(rainCount * 3);
        rainVelY = new Float32Array(rainCount);
        rainVelX = new Float32Array(rainCount);
        for (let i = 0; i < rainCount; i++) {
          positions[i * 3 + 0] = Math.random() * 1000 - 500;
          positions[i * 3 + 1] = Math.random() * 800 + 100;
          positions[i * 3 + 2] = Math.random() * 1000 - 500;
          rainVelY[i] = (12 + Math.random() * 18) * (1 + (1 - performanceFactor));
          rainVelX[i] = (Math.random() - 0.5) * (2 + Math.random() * 6);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
          map: rainTexture,
          size: Math.max(8, 12 * performanceFactor),
          sizeAttenuation: true,
          transparent: true,
          opacity: rainBaseOpacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        rainSystem = new THREE.Points(geo, mat);
        rainSystem.frustumCulled = false;
        rainSystem.renderOrder = 1;
        scene.add(rainSystem);

        const fogDensity = performanceFactor > 0.5 ? 0.001 : 0.0006;
        scene.fog = new THREE.FogExp2(0xbfd1e5, fogDensity);
      } else if (type === "windy") {
        scene.background = new THREE.Color(0xe6f2ff);
        ambient.intensity = 0.5;
        sunLight.intensity = 1.8;
        renderer.setClearColor(0xe6f2ff, 1);

        const windCount = performanceFactor > 0.6 ? STRONG_WIND : BASE_WIND;
        const positions = new Float32Array(windCount * 3);
        windVel = new Float32Array(windCount * 3);
        windLifetime = new Float32Array(windCount);

        const modelCenter = modelBounds ? modelBounds.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 0, 0);
        const modelSize = modelBounds ? modelBounds.getSize(new THREE.Vector3()) : new THREE.Vector3(100, 100, 100);
        const windRange = Math.max(modelSize.x, modelSize.y, modelSize.z) * 3;
        
        for (let i = 0; i < windCount; i++) {
          const side = Math.random();
          let startX, startY, startZ;
          
          if (side < 0.7) {
            startX = modelCenter.x - windRange * (0.8 + Math.random() * 0.4);
            startY = modelCenter.y + (Math.random() - 0.5) * modelSize.y * 2;
            startZ = modelCenter.z + (Math.random() - 0.5) * windRange;
          } else if (side < 0.9) {
            startX = modelCenter.x + (Math.random() - 0.5) * windRange;
            startY = modelCenter.y + (Math.random() - 0.5) * modelSize.y * 2;
            startZ = modelCenter.z - windRange * (0.8 + Math.random() * 0.4);
          } else {
            startX = modelCenter.x + (Math.random() - 0.5) * windRange * 0.5;
            startY = modelCenter.y + windRange * (0.5 + Math.random() * 0.3);
            startZ = modelCenter.z + (Math.random() - 0.5) * windRange * 0.5;
          }

          positions[i * 3 + 0] = startX;
          positions[i * 3 + 1] = startY;
          positions[i * 3 + 2] = startZ;

          const baseWindSpeed = 8 + Math.random() * 12;
          const windDirection = Math.PI * 0.1 * (Math.random() - 0.5);
          
          windVel[i * 3 + 0] = baseWindSpeed * Math.cos(windDirection);
          windVel[i * 3 + 1] = (Math.random() - 0.5) * 2;
          windVel[i * 3 + 2] = baseWindSpeed * Math.sin(windDirection) * 0.3;
          
          windLifetime[i] = Math.random() * 100;
        }
        
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
          map: windTexture,
          size: Math.max(20, 30 * performanceFactor),
          sizeAttenuation: true,
          transparent: true,
          opacity: windBaseOpacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        windSystem = new THREE.Points(geo, mat);
        windSystem.frustumCulled = false;
        windSystem.renderOrder = 1;
        scene.add(windSystem);

        scene.fog = new THREE.FogExp2(0xe6f2ff, 0.0008);
      } else if (type === "foggy") {
        scene.background = new THREE.Color(0xd6dbe0);
        ambient.intensity = 0.6;
        sunLight.intensity = 0.8;
        scene.fog = new THREE.FogExp2(0xd6dbe0, 0.002);
        renderer.setClearColor(0xd6dbe0, 1);
      }
    };

    applyWeather(weather);

    // FBX loader with ENHANCED materials for better reflections
    const loader = new FBXLoader();
    loader.load(
      currentFbx,
      (object) => {
        console.log("FBX Loaded successfully");

        // ENHANCED material upgrade function with realistic reflections
        const upgradeMaterial = (orig: any) => {
          if (!orig) return null;
          const baseColor = orig.color ? orig.color.clone() : new THREE.Color(0xffffff);
          let map = orig.map ?? null;
          let normalMap = orig.normalMap ?? null;
          let roughnessMap = orig.roughnessMap ?? null;
          let metalnessMap = orig.metalnessMap ?? null;
          const opacity = typeof orig.opacity === "number" ? orig.opacity : 1;
          const roughness = orig.roughness ?? (orig.specular ? 1 - (orig.specular.r ?? 0) : 0.6);
          const metalness = orig.metalness ?? 0;

          if (map && map.isTexture) {
            try {
              if (sRGB !== undefined) map.encoding = sRGB;
            } catch (e) {}
          }

          const name = ((orig && orig.name) || "").toString().toLowerCase();
          const isTransparentCandidate =
            name.includes("glass") ||
            (orig && ((orig.transparent && opacity < 0.95) || (orig.specular && orig.specular.r > 0.1)));

          if (isTransparentCandidate) {
            return new THREE.MeshPhysicalMaterial({
              map,
              normalMap,
              roughnessMap,
              metalnessMap,
              color: baseColor,
              metalness: 0.0,
              roughness: Math.max(0.02, Math.min(0.4, roughness)),
              transmission: 0.95,
              transparent: true,
              opacity: Math.max(0.05, opacity),
              ior: 1.45,
              thickness: 0.6,
              clearcoat: 0.3, // Enhanced clearcoat for better reflections
              clearcoatRoughness: 0.02,
              envMapIntensity: detailLevel * 2.5, // Increased reflection intensity
              side: THREE.DoubleSide,
            });
          }

          // Enhanced material with better reflections and shadows
          const material = new THREE.MeshStandardMaterial({
            map,
            normalMap,
            roughnessMap,
            metalnessMap,
            color: baseColor,
            metalness: metalness,
            roughness: Math.max(0.05, roughness),
            envMapIntensity: detailLevel * 2.0, // Enhanced reflections
          });

          // Enhanced material properties for better shadows and reflections
          if (!isLowEnd) {
            if (normalMap) {
              material.normalScale = new THREE.Vector2(detailLevel * 1.2, detailLevel * 1.2);
            }
            
            material.flatShading = false;
            
            // Enhanced reflection for metallic surfaces
            if (name.includes("metal") || metalness > 0.5) {
              material.envMapIntensity = detailLevel * 3.0;
              material.roughness = Math.max(0.02, material.roughness * 0.8); // Smoother metals
            }
            
            // Special handling for different material types
            if (name.includes("chrome") || name.includes("mirror")) {
              material.metalness = 1.0;
              material.roughness = 0.02;
              material.envMapIntensity = 4.0;
            }
          }

          return material;
        };

        // Apply enhanced materials and shadow settings
        object.traverse((child: any) => {
          if (!child.isMesh) return;
          
          // ENHANCED shadow casting and receiving
          child.castShadow = true;
          child.receiveShadow = true;
          
          const orig = child.material;
          try {
            if (Array.isArray(orig)) {
              child.material = orig.map((m: any) => upgradeMaterial(m) || m);
            } else {
              const nm = upgradeMaterial(orig);
              if (nm) child.material = nm;
            }
          } catch (e) {
            console.warn("material upgrade error", e);
          }

          // Enhanced geometry for better shadows
          if (!isLowEnd && detailLevel > 0.75 && child.geometry) {
            try {
              child.geometry.computeVertexNormals();
              if (child.material && child.material.normalMap) {
                child.geometry.computeTangents();
              }
              // Compute bounding sphere for better shadow culling
              child.geometry.computeBoundingSphere();
            } catch (e) {
              console.warn("geometry enhancement error", e);
            }
          }
        });

        // Model positioning and scaling
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        modelBounds = box.clone();
        
        const modelGroup = new THREE.Group();
        object.position.set(-center.x, -center.y, -center.z);
        modelGroup.add(object);
        
        const maxDimension = Math.max(size.x, size.y, size.z);
        
        if (maxDimension > 0) {
          const targetSize = 100;
          const scale = targetSize / maxDimension;
          modelGroup.scale.setScalar(scale);
          
          modelBounds.min.multiplyScalar(scale);
          modelBounds.max.multiplyScalar(scale);
        }

        // Position model above ground for proper shadows - UPDATED
        modelGroup.position.set(0, 0, 0); // Centered at origin without ground offset

        scene.add(modelGroup);

        // Camera positioning
        const scaledSize = maxDimension * modelGroup.scale.x;
        const distance = scaledSize * 1.5;
        
        camera.position.set(
          distance * 0.5,
          distance * 0.3,
          distance * 0.8
        );

        camera.lookAt(0, 0, 0);
        
        controls.target.set(0, 0, 0);
        controls.minDistance = distance * 0.3;
        controls.maxDistance = distance * 4;
        controls.update();

        setLoading(false);
        applyWeather(weather);

        // ENHANCED environment map generation for reflections
        try {
          // Update cube camera to capture the scene for reflections
          cubeCamera.position.copy(modelGroup.position);
          cubeCamera.update(renderer, scene);
          const envMap = pmremGenerator.fromCubemap(cubeRenderTarget.texture).texture;
          
          if (envMap) {
            try {
              if (sRGB !== undefined) (envMap as any).encoding = sRGB;
            } catch (e) {}
            scene.environment = envMap;
            
            // Apply environment map to all materials for better reflections
            object.traverse((child: any) => {
              if (child.isMesh && child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach((mat: any) => {
                    if (mat.envMap !== undefined) mat.envMap = envMap;
                  });
                } else {
                  if (child.material.envMap !== undefined) child.material.envMap = envMap;
                }
              }
            });
          }
        } catch (e) {
          console.warn("envmap generation failed", e);
        }
      },
      (progress) => {
        console.log("Loading progress:", progress);
      },
      (err) => {
        console.error("FBX load error:", err);
        setLoading(false);
      }
    );

    // Enhanced animation loop
    let rafId = 0;
    const animate = () => {
      frameCounter++;
      const heavyStep = frameCounter % (isLowEnd ? 4 : 3) === 0;

      // Update environment map periodically for dynamic reflections
      if (frameCounter % 60 === 0 && !isLowEnd) { // Update every 60 frames
        try {
          cubeCamera.update(renderer, scene);
          const envMap = pmremGenerator.fromCubemap(cubeRenderTarget.texture).texture;
          if (envMap && sRGB !== undefined) {
            try { (envMap as any).encoding = sRGB; } catch (e) {}
            scene.environment = envMap;
          }
        } catch (e) {}
      }

      // Weather animations (same as before)
      if (heavyStep && rainSystem && rainVelY && rainVelX) {
        const posAttr = rainSystem.geometry.attributes.position as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const count = rainVelY.length;
        const timeFactor = (Date.now() % 10000) / 10000;
        for (let i = 0; i < count; i++) {
          const idx = i * 3;
          const gust = Math.sin(i * 0.01 + timeFactor * Math.PI * 2) * 0.5;
          let x = arr[idx + 0] + (rainVelX[i] * 0.5) + gust;
          let y = arr[idx + 1] - rainVelY[i] * (0.85 + Math.random() * 0.2);
          if (y < -100) {
            y = 600 + Math.random() * 200;
            x = Math.random() * 1000 - 500;
            arr[idx + 2] = Math.random() * 1000 - 500;
          }
          if (x > 500) x = -500;
          if (x < -500) x = 500;
          arr[idx + 0] = x;
          arr[idx + 1] = y;
        }
        posAttr.needsUpdate = true;
      }

      if (heavyStep && windSystem && windVel && windLifetime && modelBounds) {
        const positions = windSystem.geometry.attributes.position as THREE.BufferAttribute;
        const arr = positions.array as Float32Array;
        const count = windVel.length / 3;
        const t = Date.now() * 0.001;
        const modelCenter = modelBounds.getCenter(new THREE.Vector3());
        const modelSize = modelBounds.getSize(new THREE.Vector3());
        const windRange = Math.max(modelSize.x, modelSize.y, modelSize.z) * 3;

        for (let i = 0; i < count; i++) {
          const base = i * 3;
          windLifetime[i] += 0.8;

          const turbulence = Math.sin(t * 2 + i * 0.1) * 0.8;
          const gustFactor = 1 + Math.sin(t * 0.3 + i * 0.05) * 0.4;
          
          arr[base + 0] += windVel[base + 0] * gustFactor + turbulence;
          arr[base + 1] += windVel[base + 1] + Math.sin(t * 3 + i * 0.02) * 0.3;
          arr[base + 2] += windVel[base + 2] + turbulence * 0.3;

          const distanceFromModel = Math.sqrt(
            Math.pow(arr[base + 0] - modelCenter.x, 2) + 
            Math.pow(arr[base + 2] - modelCenter.z, 2)
          );

          if (distanceFromModel > windRange * 1.2 || windLifetime[i] > 150 || 
              arr[base + 1] < modelCenter.y - modelSize.y * 3 || 
              arr[base + 1] > modelCenter.y + modelSize.y * 3) {
            
            const side = Math.random();
            let startX, startY, startZ;
            
            if (side < 0.7) {
              startX = modelCenter.x - windRange * (0.8 + Math.random() * 0.4);
              startY = modelCenter.y + (Math.random() - 0.5) * modelSize.y * 2;
              startZ = modelCenter.z + (Math.random() - 0.5) * windRange;
            } else if (side < 0.9) {
              startX = modelCenter.x + (Math.random() - 0.5) * windRange;
              startY = modelCenter.y + (Math.random() - 0.5) * modelSize.y * 2;
              startZ = modelCenter.z - windRange * (0.8 + Math.random() * 0.4);
            } else {
              startX = modelCenter.x + (Math.random() - 0.5) * windRange * 0.5;
              startY = modelCenter.y + windRange * (0.5 + Math.random() * 0.3);
              startZ = modelCenter.z + (Math.random() - 0.5) * windRange * 0.5;
            }

            arr[base + 0] = startX;
            arr[base + 1] = startY;
            arr[base + 2] = startZ;
            
            const baseWindSpeed = 8 + Math.random() * 12;
            const windDirection = Math.PI * 0.1 * (Math.random() - 0.5);
            
            windVel[base + 0] = baseWindSpeed * Math.cos(windDirection);
            windVel[base + 1] = (Math.random() - 0.5) * 2;
            windVel[base + 2] = baseWindSpeed * Math.sin(windDirection) * 0.3;
            
            windLifetime[i] = 0;
          }
        }
        positions.needsUpdate = true;
      }

      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(rafId);
      try { controls.dispose(); } catch(e) {}
      try { renderer.dispose(); } catch(e) {}
      try { pmremGenerator.dispose(); } catch(e) {}
      try { cubeRenderTarget.dispose(); } catch(e) {}
      try { rainTexture.dispose(); } catch(e) {}
      try { windTexture.dispose(); } catch(e) {}
      while (container && container.firstChild) container.removeChild(container.firstChild);
    };
  }, [currentFbx, weather]);

  // Show loading or no files message
  if (!validFbxUrls.length) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100" style={{ width, height }}>
        <div className="text-center">
          <div className="text-gray-500 text-lg">No 3D models available</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ width, height }}>
      {/* Loading indicator */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
          <div className="bg-white rounded-lg p-6 shadow-lg">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="text-lg font-medium">Loading 3D model...</span>
            </div>
          </div>
        </div>
      )}

      {/* 3D Viewer */}
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* Controls Overlay */}
      <div className="pointer-events-none">
        {/* Weather Controls */}
        <div
          className="absolute top-4 left-1/2 z-[9999] flex gap-2 transform -translate-x-1/2 pointer-events-auto"
          style={{ maxWidth: "calc(100% - 32px)", overflow: "auto" }}
        >
          {["sunny", "rainy", "windy", "foggy"].map((w) => (
            <button
              key={w}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                weather === w 
                  ? "bg-black text-white" 
                  : "bg-gray-200 text-black hover:bg-gray-300"
              }`}
              onClick={() => setWeather(w as any)}
              aria-label={w}
            >
              {w.charAt(0).toUpperCase() + w.slice(1)}
            </button>
          ))}
        </div>

        {/* Multiple FBX Navigation Controls */}
        {validFbxUrls.length > 1 && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-[9999] pointer-events-auto">
            <div className="bg-black bg-opacity-80 backdrop-blur-sm rounded-lg p-4 shadow-lg">
              {/* Model Info */}
              <div className="text-center mb-3">
                <div className="text-white text-sm font-medium">
                  3D Model {currentFbxIndex + 1} of {validFbxUrls.length}
                </div>
                <div className="text-gray-300 text-xs">
                  {validFbxUrls[currentFbxIndex]?.split('/').pop()?.split('.')[0] || `Model ${currentFbxIndex + 1}`}
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="flex items-center justify-center space-x-4">
                <button
                  onClick={goToPrevious}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  aria-label="Previous model"
                >
                  ← Back
                </button>

                {/* Dot Indicators */}
                <div className="flex space-x-2">
                  {validFbxUrls.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => goToIndex(index)}
                      className={`w-3 h-3 rounded-full transition-colors ${
                        index === currentFbxIndex
                          ? "bg-blue-500"
                          : "bg-gray-400 hover:bg-gray-300"
                      }`}
                      aria-label={`Go to model ${index + 1}`}
                    />
                  ))}
                </div>

                <button
                  onClick={goToNext}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Next →
                </button>
              </div>

              {/* Keyboard Shortcuts Hint */}
              <div className="text-center mt-2">
                <div className="text-gray-400 text-xs">
                  Use ← → arrow keys or click dots to navigate
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}