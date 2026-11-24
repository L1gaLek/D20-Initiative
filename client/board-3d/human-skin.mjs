import * as THREE from '../../vendor/three/three.module.mjs';

// Authored painted skin: shared by the map, sheet preview and Studio. Coordinates
// are in the canonical head/body space, so both existing rigs keep their fit.
export function paintedSkinColor(x, y, z, target = new THREE.Color()) {
  const spot = (cx, cy, cz, sx, sy, sz) => Math.exp(-(((x-cx)/sx)**2+((y-cy)/sy)**2+((z-cz)/sz)**2));
  const cheek = spot(.046,1.551,.125,.024,.021,.04) + spot(-.046,1.551,.125,.024,.021,.04);
  const nose = spot(0,1.567,.164,.018,.025,.035);
  const lip = spot(0,1.522,.153,.025,.007,.022);
  const ears = spot(.08,1.575,.025,.018,.035,.036) + spot(-.08,1.575,.025,.018,.035,.036);
  const warm = Math.min(1, cheek*.32 + nose*.17 + ears*.22);
  const highlight = spot(0,1.614,.117,.052,.035,.06)*.035;
  return target.setRGB(1+highlight-.045*lip, 1-warm*.38-lip*.25+highlight, 1-warm*.35-lip*.18+highlight*.65);
}

export function createPaintedSkinMaterial() {
  const skin = new THREE.MeshStandardMaterial({ color:'#e1ac8b', roughness:.91, metalness:0, vertexColors:true });
  skin.name = 'D20 Painted Skin';
  skin.userData.skinStyle = 'painted';
  skin.customProgramCacheKey = () => 'd20-painted-skin-v1';
  skin.onBeforeCompile = shader => {
    // Broad, softly blended light bands, without pores, noisy microdetail or a
    // plastic highlight. Preserve darkness and the scene's actual light level.
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float skinBase = max(dot(diffuseColor.rgb, vec3(.2126,.7152,.0722)), .001);
      float skinLight = dot(outgoingLight, vec3(.2126,.7152,.0722)) / skinBase;
      float skinBand = (.42 + .36*smoothstep(.24,.64,skinLight)
        + .22*smoothstep(.86,1.35,skinLight)) * smoothstep(0.,.18,skinLight);
      outgoingLight = mix(outgoingLight, diffuseColor.rgb*skinBand, .58);
      #include <opaque_fragment>
    `);
  };
  return skin;
}
