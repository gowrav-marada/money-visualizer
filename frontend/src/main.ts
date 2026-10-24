import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { AppComponent } from './app/shell.component';
import { routes } from './app/app.routes';
import { apiInterceptor } from './app/core/api.interceptor';

bootstrapApplication(AppComponent, {
  providers: [provideHttpClient(withInterceptors([apiInterceptor])), provideRouter(routes, withComponentInputBinding())]
}).catch(error => console.error(error));
