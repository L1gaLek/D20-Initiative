import * as THREE from '../../vendor/three/three.module.mjs';

export function fogMaterial(opacity, explored=false, shell=false) {
  return new THREE.ShaderMaterial({
    transparent:opacity<1,depthWrite:opacity===1,side:THREE.DoubleSide,
    uniforms:{time:{value:0},opacity:{value:opacity},explored:{value:explored?1:0},shell:{value:shell?1:0}},
    vertexShader:`uniform float time;varying vec3 world;varying vec3 face;varying float level;
      void main(){vec4 p=modelMatrix*instanceMatrix*vec4(position,1.);
      float wave=sin(p.x*1.7+time*.16)*sin(p.z*1.4-time*.13)*.11+sin(p.x*.53+p.z*.71+time*.1)*.07;
      p.y+=step(0.,position.y)*wave;world=p.xyz;face=normal;level=position.y+.5;
      gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader:`uniform float time;uniform float opacity;uniform float explored;uniform float shell;
      varying vec3 world;varying vec3 face;varying float level;
      float cloud(vec3 p){return sin(p.x*1.83+sin(p.z*1.41+time*.11)+p.y*2.)*sin(p.z*2.31-p.x*.37+time*.08)*.5+.5;}
      void main(){float n=cloud(world*.8)*.65+cloud(world*2.1+4.)*.35;
      vec3 unknown=mix(vec3(.018,.025,.045),vec3(.11,.15,.23),n);
      vec3 known=mix(vec3(.12,.14,.20),vec3(.24,.27,.35),n);
      vec3 col=mix(unknown,known,explored);col*=.55+.45*abs(face.y);
      col+=shell*vec3(.08,.11,.16);float alpha=opacity*mix(1.,(.3+n*.7)*smoothstep(0.,.5,level),shell);
      gl_FragColor=vec4(col,alpha);}`
  });
}

export function magicMaterial(opacity, explored=false) {
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{time:{value:0},opacity:{value:opacity},dim:{value:explored ? .35 : 1}},
    vertexShader:'varying vec3 world;varying vec3 face;void main(){vec4 p=modelMatrix*instanceMatrix*vec4(position,1.);world=p.xyz;face=normal;gl_Position=projectionMatrix*viewMatrix*p;}',
    fragmentShader:`uniform float time;uniform float opacity;uniform float dim;varying vec3 world;varying vec3 face;
      void main(){vec2 glyph=fract(vec2(world.x+world.z,world.y)*vec2(1.5,2.8))-.5;
      float rune=1.-smoothstep(.018,.045,abs(abs(glyph.x)+abs(glyph.y)-.27));
      float bands=pow(.5+.5*sin(world.y*22.-time*1.4),12.);
      float pulse=.5+.5*sin(world.x*.7+world.z*.6-time*.65);
      vec3 color=mix(vec3(.31,.13,.75),vec3(.2,.78,1.),pulse*.65+rune*.35);
      color+=rune*vec3(.35,.45,.55)+bands*.14;
      gl_FragColor=vec4(color*dim,opacity*(.30+rune*.42+bands*.16+abs(face.y)*.2));}`
  });
}
