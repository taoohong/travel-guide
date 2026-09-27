import { ContentModule } from '@travel-guide/constants';
import { createGuideService } from './guideService';
export const transportService = createGuideService(ContentModule.TRANSPORT, 'transport', (context, code) => context.api.transport(code));
