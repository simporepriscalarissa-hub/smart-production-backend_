import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { OuvriersModule } from './ouvriers/ouvriers.module';
import { ProductionModule } from './production/production.module';
import { QualiteModule } from './qualite/qualite.module';
import { AuthModule } from './auth/auth.module';
import { OeeModule } from './oee/oee.module';
import { DepartementsModule } from './departements/departements.module';
import { EventsModule } from './events/events.module';
import { ReferencesModule } from './references/references.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true,
      ssl: { rejectUnauthorized: false },
      autoLoadEntities: true,
    }),
    UsersModule,
    OuvriersModule,
    ProductionModule,
    QualiteModule,
    AuthModule,
    OeeModule,
    DepartementsModule,
    EventsModule,
    ReferencesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}