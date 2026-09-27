import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { readConfig } from './config/env';
import { PrismaService } from './prisma/prisma.service';
import { repositoryProviders } from './prisma/repositories';
import { HealthController, HealthService } from './modules/health';
import { DestinationController, DestinationService } from './modules/destination';
import { VisaController, VisaService } from './modules/visa';
import { ContentController, ContentService } from './modules/content';
import { TripController, TripService } from './modules/trip';
import { TripCollaborationController, TripCollaborationService, TripInviteController } from './modules/trip-collaboration';
import { PlanController, PlanService } from './modules/plan';
import { TripExpenseController, TripExpenseService } from './modules/trip-expenses';
import { AuthController, AuthService, AdminGuard, RoleGuard } from './modules/auth/auth';
import { UserAuthController, UserProfileController, UserAuthService, UserGuard } from './modules/auth/users';
import { AdminController, AdminContentService, ContentHealthService } from './modules/admin';
import { LocalStorageService, MediaController, MediaService, STORAGE } from './modules/media';
import { AdminCountryGuideController, CountryGuideController, CountryGuideService } from './modules/country-guides';

@Module({
  controllers: [HealthController, DestinationController, VisaController, ContentController, TripController,
    TripCollaborationController, TripInviteController, PlanController, TripExpenseController, AuthController, UserAuthController, UserProfileController, AdminController, MediaController,
    CountryGuideController, AdminCountryGuideController],
  providers: [
    { provide: 'APP_CONFIG', useFactory: readConfig }, PrismaService, Reflector, ...repositoryProviders,
    HealthService, DestinationService, VisaService, ContentService, TripService, TripCollaborationService, PlanService, TripExpenseService,
    AuthService, AdminGuard, RoleGuard, UserAuthService, UserGuard, AdminContentService, ContentHealthService, MediaService, CountryGuideService,
    { provide: STORAGE, useClass: LocalStorageService },
  ],
})
export class AppModule {}
