export const IMAGE_MASK_EDIT_PROMPT_PREFIX = "参考图中蓝色高亮覆盖区域是需要修改的位置，蓝色只是编辑标记，不要保留在最终图像中。只修改蓝色高亮区域，其他区域的构图、人物、文字、光影和风格保持不变。修改要求：";

export function imageReferenceLabel(index: number) {
    return `图片${index + 1}`;
}
