import fuji from '../../assets/landmarks/fuji.svg';
import gyeongbok from '../../assets/landmarks/gyeongbok.svg';
import eiffel from '../../assets/landmarks/eiffel.svg';

interface DestinationVisual { asset: string; heroWidth: string; heroHeight: string; heroTop: string; heroRight: string; caption: string }

export const destinationVisuals: Record<string, DestinationVisual> = {
  JP: { asset: fuji, heroWidth: '425rpx', heroHeight: '305rpx', heroTop: '35rpx', heroRight: '-18rpx', caption: '富士山 · 山与樱花' },
  KR: { asset: gyeongbok, heroWidth: '370rpx', heroHeight: '320rpx', heroTop: '19rpx', heroRight: '-17rpx', caption: '景福宫 · 宫阙风华' },
  FR: { asset: eiffel, heroWidth: '245rpx', heroHeight: '390rpx', heroTop: '0rpx', heroRight: '14rpx', caption: '埃菲尔铁塔 · 巴黎' },
};

export const destinationThemeByCode: Record<string, string> = {
  JP: 'japan', KR: 'korea', FR: 'france', TH: 'thailand', NZ: 'new-zealand',
};
