import 'zone.js'; // <-- ensure Zone is loaded before Angular
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { isDevMode } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { enableProdMode } from '@angular/core';
import { appConfig } from './app/app.config'; 

console.log('[main] starting bootstrap');          // TEMP debug
bootstrapApplication(AppComponent, appConfig)
  .then(() => console.log('[main] bootstrapped'))   // TEMP debug
  .catch(err => console.error('[main] bootstrap error', err));
bootstrapApplication(AppComponent, { providers: [provideRouter(routes), provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          })] }).catch(err => console.error(err));
bootstrapApplication(AppComponent, {
  providers: [
    provideServiceWorker('ngsw-worker.js', {
      enabled: true,
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
});
