import 'leaflet/dist/leaflet.css';
import './style.css';
import { SolarlensApp } from './app';

document.addEventListener('DOMContentLoaded', () => {
  new SolarlensApp().init();
});
