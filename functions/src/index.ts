import * as admin from 'firebase-admin';
admin.initializeApp();

export {
  encryptAndStoreTemplate,
  deleteEmployeeTemplates,
  onEmployeeWrite,
} from './enrolment';
