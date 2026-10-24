import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from './toast.service';

/** Adds the anti-CSRF header the API requires and turns ProblemDetails errors into toasts. */
export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  const toast = inject(ToastService);
  const withHeader = request.url.startsWith('/api')
    ? request.clone({ setHeaders: { 'X-Requested-With': 'MoneyVisualizer' } })
    : request;
  return next(withHeader).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        window.location.href = `/api/auth/login?returnUrl=${encodeURIComponent(location.pathname)}`;
      } else if (error.status !== 409) {
        toast.error(describeError(error));
      }
      return throwError(() => error);
    })
  );
};

export function describeError(error: HttpErrorResponse): string {
  const body = error.error;
  if (body?.errors) {
    const first = Object.values(body.errors as Record<string, string[]>)[0];
    if (first?.length) return first[0];
  }
  if (body?.detail) return body.detail;
  if (body?.title) return body.title;
  if (error.status === 0) return 'Cannot reach the server. Is the backend running?';
  return 'Something went wrong. Please try again.';
}
