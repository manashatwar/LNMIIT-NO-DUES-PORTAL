from django.apps import AppConfig


class MainConfig(AppConfig):
    name = 'main'

    def ready(self):
        from . import checks  # noqa: F401  registers the approval-workflow system check
