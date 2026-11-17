Three.js 0.187.0 (MIT), vendored for a self-contained GitHub Pages deployment.

Source: https://registry.npmjs.org/three/-/three-0.187.0.tgz

Tarball SHA-256: `ff540832ded0cfe919764d24a3d88f3e2a05f23303f876423e4f893841e90728`.

Included upstream files:

- `build/three.core.js` → `three.core.mjs`
- `build/three.module.js` → `three.module.mjs`
- `examples/jsm/controls/OrbitControls.js` → `OrbitControls.mjs`
- `examples/jsm/controls/TransformControls.js` → `TransformControls.mjs`
- `examples/jsm/loaders/GLTFLoader.js` → `GLTFLoader.mjs`
- `examples/jsm/exporters/GLTFExporter.js` → `GLTFExporter.mjs`
- `examples/jsm/utils/SkeletonUtils.js` → `SkeletonUtils.mjs`
- `examples/jsm/utils/BufferGeometryUtils.js` → `BufferGeometryUtils.mjs`
- `LICENSE`

Only import specifiers have changed: `./three.core.js` to `./three.core.mjs`
and OrbitControls' bare `three` import to `./three.module.mjs`. Code is otherwise
unchanged. The `.mjs` extension avoids CommonJS ambiguity in the static client.
These modules are loaded lazily when the user selects 3D, not in the 2D path.
The workshop uses the same upstream 0.187.0 modules. Bare `three` imports point
to `./three.module.mjs`, and addon-to-addon imports point to their local `.mjs`
copies. No CDN or runtime npm installation is required.
