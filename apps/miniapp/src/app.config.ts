export default defineAppConfig({
  pages: ['pages/dashboard/index', 'pages/trip-detail/index', 'pages/trip-edit/index', 'pages/plan-item-edit/index', 'pages/settings/index', 'pages/destination-detail/index', 'pages/source/index', 'pages/trip-invite/index', 'pages/login/index'],
  subPackages: [{ root: 'pages/globe', pages: ['index'] }],
  window: { backgroundTextStyle: 'light', navigationBarBackgroundColor: '#FFFFFF',
    navigationBarTitleText: '出国旅行宝典', navigationBarTextStyle: 'black', backgroundColor: '#FFFFFF' },
});
