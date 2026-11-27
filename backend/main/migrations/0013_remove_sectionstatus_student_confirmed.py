from django.db import migrations


class Migration(migrations.Migration):
    """Store, LUCS, Sports, Medical, NAD Cell and Administration no longer wait
    for the student's "Confirm & Send": a request reaches each office by itself
    once that office's prerequisites have approved (engine.PREREQUISITES). Rows
    that were still "not sent" are therefore sent, too."""

    dependencies = [
        ('main', '0012_refund_manager'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='sectionstatus',
            name='student_confirmed',
        ),
    ]
