from django.db import migrations, models


def keep_refund_choice(apps, schema_editor):
    """A main account that had taken refunds over becomes a refund manager."""
    UserProfile = apps.get_model("main", "UserProfile")
    UserProfile.objects.filter(refunds_by_head=True).update(is_refund_manager=True)


class Migration(migrations.Migration):
    """Accounts: refunds are sent by refund managers (staff, or the main account
    after "Add me"), else the last level. The main account joins its chain at a
    level like staff ("Add me"), so its FIRST / LAST place goes."""

    dependencies = [
        ('main', '0011_refunds_by_head'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='is_refund_manager',
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(keep_refund_choice, migrations.RunPython.noop),
        migrations.RemoveField(model_name='userprofile', name='refunds_by_head'),
        migrations.RemoveField(model_name='userprofile', name='chain_position'),
    ]
