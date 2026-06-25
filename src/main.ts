import 'leaflet/dist/leaflet.css';
import './style.css';
import { WorldGuesserApp } from './app';

document.addEventListener('DOMContentLoaded', () => {
  new WorldGuesserApp().init();
});
