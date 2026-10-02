// Standard-issue flashlight: a strong, long-reaching main beam, a softer wide
// fill, and a faint visible cone so you can see where the beam points.
import * as THREE from 'three';

const LENGTH = 34;          // visible cone length (the light itself reaches further)

export class Flashlight {
  constructor(camera) {
    this.main = new THREE.SpotLight(0xfff2d6, 0, 72, 0.5, 0.45, 1);
    this.fill = new THREE.SpotLight(0xffe8c4, 0, 40, 0.85, 0.8, 1);
    for (const l of [this.main, this.fill]) {
      l.position.set(0.22, -0.18, 0);
      l.target.position.set(0, 0, -1);
      camera.add(l, l.target);
    }
    // visible beam: an open cone, apex at the lamp, fading with distance
    const radius = Math.tan(0.42) * LENGTH;
    const geo = new THREE.ConeGeometry(radius, LENGTH, 32, 1, true);
    geo.translate(0, -LENGTH / 2, 0);
    geo.rotateX(Math.PI / 2);        // open end points forward (-Z)
    this.coneMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xffe6b8) } },
      vertexShader: `
        varying float vDist;
        varying vec3 vNormalV; varying vec3 vViewPos;
        void main() {
          vDist = length(position) / ${LENGTH.toFixed(1)};
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewPos = mv.xyz; vNormalV = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uOpacity; uniform vec3 uColor;
        varying float vDist; varying vec3 vNormalV; varying vec3 vViewPos;
        void main() {
          float fall = pow(clamp(1.0 - vDist, 0.0, 1.0), 1.7);
          float rim = 1.0 - abs(dot(normalize(-vViewPos), normalize(vNormalV)));
          float a = uOpacity * fall * (0.35 + 0.65 * rim);
          gl_FragColor = vec4(uColor * a, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.cone = new THREE.Mesh(geo, this.coneMat);
    this.cone.position.set(0.22, -0.18, 0);
    this.cone.frustumCulled = false;
    this.cone.renderOrder = 2;
    camera.add(this.cone);
    this.on = false;
  }

  // darkness: 0 (day) .. 1 (night); rain makes the beam show up more
  update(darkness, rain) {
    this.main.intensity = this.on ? 46 : 0;
    this.fill.intensity = this.on ? 10 : 0;
    this.coneMat.uniforms.uOpacity.value = this.on ? (0.05 + 0.13 * darkness) * (1 + rain * 0.6) : 0;
    this.cone.visible = this.on && darkness > 0.05;
  }
}
