import {addDoc,collection,doc,getDocs,orderBy,query} from 'firebase/firestore';
import {db} from '../firebaseConfig';
export interface DocumentVersion {id:string;version:number;content:string;createdAt:string;createdBy:string;}
export async function createDocumentVersion(documentId:string,content:string,createdBy:string,version:number){const ref=await addDoc(collection(db,'documents',documentId,'versions'),{version,content,createdAt:new Date().toISOString(),createdBy});return ref.id;}
export async function listDocumentVersions(documentId:string){const snap=await getDocs(query(collection(db,'documents',documentId,'versions'),orderBy('version','desc')));return snap.docs.map(d=>({id:d.id,...d.data()} as DocumentVersion));}
