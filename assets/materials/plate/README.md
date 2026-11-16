# Plate PBR materials

Derived from these ambientCG assets:

- Steel: [Metal032](https://ambientcg.com/view?id=Metal032).
- Leather: [Leather037](https://ambientcg.com/view?id=Leather037).
- Woven cloth: [Fabric030](https://ambientcg.com/view?id=Fabric030).

All three are released under [CC0](https://docs.ambientcg.com/license/), including
redistribution of raw assets within a game. No remote asset service is required
at runtime. Original map hashes and source URLs are recorded in `sources.json`.

Maps are resized from the original 1K JPG packages to 512 px. Color maps are sRGB;
OpenGL tangent-space normals and metallic/roughness maps are linear. In the packed
PNG, green stores roughness and blue stores metallic (255 for steel, 0 otherwise).
The red channel is 255. These are not ambient occlusion maps.

To rebuild, unpack the three original `*_1K-JPG.zip` packages into matching
subdirectories, install `sharp` in a build-only location, and run:

```sh
D20_SHARP_MODULE=/path/to/node_modules/sharp node scripts/prepare-plate-materials.cjs /path/to/packages
```

`sharp` is a build dependency only; it is not loaded by the browser.
