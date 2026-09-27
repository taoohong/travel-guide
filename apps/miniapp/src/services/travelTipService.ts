import { ContentModule } from '@travel-guide/constants';
import { createGuideService } from './guideService';
export const travelTipService = createGuideService(ContentModule.TRAVEL_TIP, 'travelTip', (context, code) => context.api.travelTips(code));
