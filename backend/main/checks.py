"""
Django system checks for the No-Dues workflow.

Every exit type's approval graph (engine.workflow) must be a valid DAG: no
section may wait for a section that exit type doesn't have, and no cycle. Kahn's
algorithm (engine.analyze_workflow) finds both. Django runs these checks before
`runserver`, `migrate` and `test`, so a broken workflow stops the app from
starting instead of silently leaving students unable to finish their clearance.
"""
from django.core import checks

from . import engine


@checks.register()
def approval_workflows(app_configs, **kwargs):
    return [
        checks.Error(problem, hint="Fix engine.PREREQUISITES, REQUIRED_SECTIONS or OPTIONAL_PREREQUISITES.",
                     id="main.E001")
        for problem in engine.workflow_problems()
    ]
