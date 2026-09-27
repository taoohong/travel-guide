import { ContentModule } from '@travel-guide/constants';
import { createGuideService } from './guideService';
export const packingService = createGuideService(ContentModule.PACKING, 'packing', (context, code) => context.api.packing(code));
