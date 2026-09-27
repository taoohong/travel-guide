import { clientApi } from '../api/client';
import { contentCache, storage } from './context';
import { ContentVersionService } from './contentVersionService';
import { useContentVersionStore } from '../stores/contentVersionStore';
import { countryService } from './countryService';
import { countryGuideService } from './countryGuideService';
import { visaService } from './visaService';
import { attractionService } from './attractionService';
import { transportService } from './transportService';
import { packingService } from './packingService';
import { travelTipService } from './travelTipService';

// Keep refresh handlers for previously cached modules registered even before their tabs open.
void [countryService, countryGuideService, visaService, attractionService, transportService, packingService, travelTipService];
export const contentVersionService = new ContentVersionService(clientApi, contentCache, storage,
  (value) => useContentVersionStore.getState().setResult(value));
