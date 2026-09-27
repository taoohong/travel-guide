import { ContentModule } from '@travel-guide/constants';
import { createGuideService } from './guideService';
export const attractionService = createGuideService(ContentModule.ATTRACTION, 'attraction', (context, code) => context.api.attractions(code));
