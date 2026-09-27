import { ContentModule } from '@travel-guide/constants';
import { createGuideService } from './guideService';
export const travelAppService = createGuideService(ContentModule.COUNTRY, 'travelApp', (context, code) => context.api.travelApps(code));
