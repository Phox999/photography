import { createFavoriteStore, FAVORITES_STORAGE_KEY, favoriteKey, toggleFavorite } from './portfolio-favorites.js';
export type Favorite = { slug: string; title: string; image: string; number: number };
const store = createFavoriteStore();
export const readFavorites = (): Favorite[] => store.read();
export const favoritesPersistent = () => store.persistent();
export function saveFavorites(items: Favorite[]) {
  store.save(items);
  window.dispatchEvent(new CustomEvent('phox:favorites-change'));
}
export function removeFavorite(item: Favorite) {
  saveFavorites(readFavorites().filter(entry => favoriteKey(entry) !== favoriteKey(item)));
}
export function toggleClientFavorite(item: Favorite) {
  const result = toggleFavorite(readFavorites(), item);
  if (!result.error) saveFavorites(result.items);
  return result;
}
window.addEventListener('storage', event => {
  if (event.key !== null && event.key !== FAVORITES_STORAGE_KEY) return;
  store.sync(event.newValue);
  window.dispatchEvent(new CustomEvent('phox:favorites-change'));
});
