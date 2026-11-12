import { TableSkeleton } from "@/components/ui/page-skeleton";

export default function AdminLoading() {
    return (
        <main className="p-3 md:p-6">
            <TableSkeleton label="正在加载管理后台..." />
        </main>
    );
}
