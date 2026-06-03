from django.shortcuts import render

from rest_framework.decorators import api_view
from rest_framework.response import Response
import platform, sys

@api_view(['GET'])
def data_view(request):
    return Response({
        'message': 'Protected data from Django.',
        'user': request.headers.get('X-Api-Key', 'anonymous'),
    })

@api_view(['GET'])
def status_view(request):
    return Response({
        'service': 'protected-api',
        'python': sys.version,
        'platform': platform.system(),
    })

@api_view(['GET'])
def search_view(request):
    query = request.GET.get('q', '')
    # Placeholder — returns the query back
    return Response({
        'query': query,
        'results': [f'Result for: {query}'] if query else [],
    })