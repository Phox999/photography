export const unit = n => Math.min(1, Math.max(0, n));
export const smooth = n => { const t = unit(n); return t*t*(3-2*t); };
export function galleryCursor(p, count = 6) {
  const cursor = unit((p - .465) / (.64 - .465)) * (count - 1);
  const index = Math.floor(cursor);
  return index + smooth((cursor - index - .15) / .7);
}
export const galleryX = (i, spacing = 3.2) => i === 0 ? 0 : i % 2 ? spacing : -spacing;
export const GALLERY_DEPTH_STEP = 12;
export const galleryCameraZ = (distance, cursor) => distance - cursor * GALLERY_DEPTH_STEP;
export const galleryCardDepth = (distance, cursor, index) => galleryCameraZ(distance, cursor) + index * GALLERY_DEPTH_STEP;
export function coverUv(imageAspect, frameAspect, positionY = .5) {
  const x = Math.min(1, frameAspect / imageAspect);
  const y = Math.min(1, imageAspect / frameAspect);
  // Three.js UVs start at the image's bottom edge. CSS object-position starts
  // at the top, so invert the vertical percentage when placing the crop.
  return { x, y, offsetX: (1 - x) * .5, offsetY: (1 - y) * (1 - positionY) };
}
export function layerState(p) {
  const travel = smooth((p-.12)/.10);
  const rejoin = smooth((p-.30)/.055);
  const subjectX=p<.30?1-2*travel:rejoin>=1?0:-(1-rejoin);
  return {subjectX,background:1,original:smooth((p-.355)/.02),scale:1-.34*smooth((p-.375)/.055)};
}
