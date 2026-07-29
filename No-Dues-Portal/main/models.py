from django.db import models

# Create your models here.

class Faculty(models.Model):
	name = models.CharField(max_length=250)
	webmail = models.CharField(max_length=100,unique=True)
	password = models.CharField(max_length=250)
	dept = models.CharField(max_length=100)
	#approval = models.BooleanField(default=False)

	def __unicode__(self):
		return self.name

class Lab(models.Model):
	name = models.CharField(max_length=250,default="Lab")
	webmail = models.CharField(max_length=100,unique=True)
	password = models.CharField(max_length=250)

	def __unicode__(self):
		return self.name

class Student(models.Model):
	name = models.CharField(max_length=250)
	roll = models.IntegerField(default=0)
	webmail = models.CharField(max_length=100,unique=True)
	password = models.CharField(max_length=250)
	dept = models.CharField(max_length=100)
	hostel = models.CharField(max_length=100)
	faculty_approval = models.ManyToManyField(Faculty, through = 'StudFacStatus')
	lab_approval = models.ManyToManyField(Lab, through = 'StudLabStatus')
	caretaker_approval = models.BooleanField(default=False)
	warden_approval = models.BooleanField(default=False)
	gymkhana_approval = models.BooleanField(default=False)
	library_approval = models.BooleanField(default=False)
	online_cc_approval = models.BooleanField(default=False)
	cc_approval = models.BooleanField(default=False)
	assistant_registrar_approval = models.BooleanField(default=False)
	submit_thesis = models.BooleanField(default=False)
	hod_approval = models.BooleanField(default=False)
	account_approval = models.BooleanField(default=False)
	intake_submitted = models.BooleanField(default=False)
	vacant_room_no = models.CharField(max_length=50, default='', blank=True)
	btp_doc_title = models.CharField(max_length=250, default='', blank=True)
	btp_form_no = models.CharField(max_length=100, default='', blank=True)
	btp_plagiarism = models.CharField(max_length=50, default='', blank=True)
	offer_letter_name = models.CharField(max_length=250, default='', blank=True)

	def dept_status(self):
		faculty_dept=Faculty.objects.filter(dept=self.dept)
		for fac in faculty_dept:
			st = StudFacStatus.objects.filter(faculty=fac, student=self).first()
			if not st or not st.approval:
				return False
		return True

	def lab_status(self):
		labs=Lab.objects.all()
		for lab in labs:
			st = StudLabStatus.objects.filter(lab=lab, student=self).first()
			if not st or not st.approval:
				return False
		return True


	def __unicode__(self):
		return self.webmail


class StudFacStatus(models.Model):
	faculty = models.ForeignKey(Faculty,on_delete=models.CASCADE)
	student = models.ForeignKey(Student,on_delete=models.CASCADE)
	approval = models.BooleanField(default = False)

	def __unicode__(self):
		return self.student.webmail

class StudLabStatus(models.Model):
	lab = models.ForeignKey(Lab,on_delete=models.CASCADE)
	student = models.ForeignKey(Student,on_delete=models.CASCADE)
	approval = models.BooleanField(default = False)

	def __unicode__(self):
		return self.student.webmail

class Caretaker(models.Model):
	name = models.CharField(max_length=250)
	webmail = models.CharField(max_length=100,unique=True)
	password = models.CharField(max_length=250)
	hostel = models.CharField(max_length=100)

	def __unicode__(self):
		return self.name

class Warden(models.Model):
	name = models.CharField(max_length=250)
	webmail = models.CharField(max_length=100,unique=True)
	password = models.CharField(max_length=250)
	hostel = models.CharField(max_length=100)

	def __unicode__(self):
		return self.name

class Gymkhana(models.Model):
	name = models.CharField(max_length=250,default="Gymkhana")
	webmail = models.CharField(max_length=100,unique=True)
	password = models.CharField(max_length=250)

	def __unicode__(self):
		return self.name

class Library(models.Model):
	name = models.CharField(max_length=250,default="Library")
	webmail = models.CharField(max_length=100,unique=True)
	password = models.CharField(max_length=250)

	def __unicode__(self):
		return self.name

class OnlineCC(models.Model):
	name = models.CharField(max_length=250,default="OnlineCC")
	webmail = models.CharField(max_length=100,unique=True)
	password = models.CharField(max_length=250)

	def __unicode__(self):
		return self.name

class CC(models.Model):
	name = models.CharField(max_length=250,default="CC")
	webmail = models.CharField(max_length=100,unique=True)
	password = models.CharField(max_length=250)

	def __unicode__(self):
		return self.name

class SubmitThesis(models.Model):
	name = models.CharField(max_length=250,default="Submit Thesis")
	webmail = models.CharField(max_length=100,unique=True)
	password = models.CharField(max_length=250)

	def __unicode__(self):
		return self.name

class asstreg(models.Model):
	name = models.CharField(max_length=250)
	webmail = models.CharField(max_length=100,unique=True)
	password = models.CharField(max_length=250)

	def __unicode__(self):
		return self.name

class HOD(models.Model):
	name = models.CharField(max_length=250)
	webmail = models.CharField(max_length=100,unique=True)
	password = models.CharField(max_length=250)
	dept = models.CharField(max_length=100)

	def __unicode__(self):
		return self.name

class Account(models.Model):
	name = models.CharField(max_length=250,default="Account")
	webmail = models.CharField(max_length=100,unique=True)
	password = models.CharField(max_length=250)

	def __unicode__(self):
		return self.name
