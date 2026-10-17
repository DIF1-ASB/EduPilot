import type { MaterialContent } from '../materials/content';
export type AssignmentPolicy={maxAttempts:number,durationMinutes:number,answerPolicy:'manual'|'after_due'|'after_last',dueDate:string|null};
export type SubmissionDTO={id:string,assignmentId:string,studentId:string,text:string,submittedAt:string,
 grade:null|{score:number,maxScore:number,teacherComment:string,approvedAt:string}};
export type AssignmentStudentDTO={id:string,kind:'homework'|'test',title:string,classId:string,className:string,materialId:string,subject:string,teacherName:string,
 dueDate:string|null,policy:AssignmentPolicy,usedAttempts:number,bestScore:number|null,version:number,closed:boolean,
 content?:MaterialContent,submission?:SubmissionDTO|null,attempts:{id:string,number:number,status:string}[]};
export type TeacherAssignmentDTO={id:string,kind:'homework'|'test',title:string,classId:string,className:string,materialId:string,materialVersion:number|null,
 policy:AssignmentPolicy,version:number,snapshot:MaterialContent|null,solutionsReleasedAt:string|null,disclosureLockedAt:string|null,closedAt:string|null,
 submissions:SubmissionDTO[],attempts:{id:string,studentId:string,studentName:string,number:number,status:string}[]};
