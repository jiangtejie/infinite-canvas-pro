import type { ProTableProps } from "@ant-design/pro-components";
import type { TablePaginationConfig } from "antd";

type AdminTableShell = Pick<ProTableProps<Record<string, unknown>, Record<string, never>>, "search" | "defaultSize" | "tableLayout" | "scroll" | "cardProps" | "options">;

/** 后台列表统一的 ProTable 外观与操作配置：关闭查询表单、固定布局、卡片样式与刷新按钮 */
export function buildAdminTableProps({ scrollX = 880, onReload }: { scrollX?: number; onReload: () => void }): AdminTableShell {
    return {
        search: false,
        defaultSize: "middle",
        tableLayout: "fixed",
        scroll: { x: scrollX },
        cardProps: { variant: "borderless" },
        options: { density: true, setting: true, reload: onReload },
    };
}

/** 后台列表统一分页配置 */
export function buildAdminPagination({
    page,
    pageSize,
    total,
    unit = "条",
    changePage,
    changePageSize,
}: {
    page: number;
    pageSize: number;
    total: number;
    unit?: string;
    changePage: (page: number) => void;
    changePageSize: (pageSize: number) => void;
}): TablePaginationConfig {
    return {
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        pageSizeOptions: [10, 20, 50, 100],
        showTotal: (value) => `共 ${value} ${unit}`,
        onChange: (nextPage, nextPageSize) => (nextPageSize !== pageSize ? changePageSize(nextPageSize) : changePage(nextPage)),
    };
}
