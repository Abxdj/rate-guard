import requests
from django.http import JsonResponse
from django.conf import settings

class RateLimitMiddleware:
    """
    Calls the Node.js rate-guard service before processing any request.
    If rate-guard returns 429, we block the request here and never touch the view.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        identifier = (
            request.headers.get('X-Api-Key') or
            request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or
            request.META.get('REMOTE_ADDR', 'unknown')
        )

        try:
            response = requests.post(
                f"{settings.RATE_GUARD_URL}/check",
                headers={'X-Api-Key': identifier},
                timeout=1
            )

            if response.status_code == 429:
                data = response.json()
                return JsonResponse(
                    {
                        'error': 'Too Many Requests',
                        'message': data.get('message', 'Rate limit exceeded.'),
                        'retryAfter': data.get('retryAfter', 1),
                    },
                    status=429
                )

        except requests.exceptions.RequestException:
            # If rate-guard is down, fail open (allow the request)
            pass

        return self.get_response(request)