from django.urls import path
from . import views

urlpatterns = [
    path('data/', views.data_view),
    path('status/', views.status_view),
    path('search/', views.search_view),
]