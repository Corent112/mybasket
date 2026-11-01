import {requireAdmin} from '@/lib/admin/guard';
import './admin.css';
export default async function AdminLayout({children}:{children:React.ReactNode}){
 await requireAdmin();
 return <>{children}</>;
}
