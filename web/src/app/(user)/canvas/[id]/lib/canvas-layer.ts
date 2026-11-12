/**
 * 画布浮层层级：与原散落 z-index 数值一一对应，只做命名收敛，未合并档位（合并会改变遮挡关系）。
 * 新增浮层时优先复用已有档位；确需新档位时在这里补一行。
 */
export const CANVAS_Z = {
    /** 顶部/底部工具条、缩放、小地图。 */
    toolbar: 50,
    /** 工具条内的下拉菜单（父级已建立层叠上下文，与工具条同值）。 */
    toolbarMenu: 50,
    /** 顶栏下拉菜单、批量生成进度。 */
    menu: 60,
    /** 节点悬浮工具条。 */
    hoverToolbar: 70,
    /** 右键菜单、Skill 浮层。 */
    contextMenu: 80,
    /** 对齐参考线、参考选择提示。 */
    guide: 90,
    /** 双击/连线创建菜单。 */
    createMenu: 120,
    /** 居中的确认/导入浮层。 */
    dialog: 130,
    /** 通过 portal 挂到 body 的设置类浮层。 */
    popover: 1200,
    /** 浮层内的 Tooltip。 */
    tooltip: 1300,
    /** 全屏媒体预览与预览控件。 */
    preview: 2000,
    previewControl: 2010,
} as const;
