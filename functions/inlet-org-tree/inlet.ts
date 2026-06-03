import type { PostgrestClient } from "@supabase/postgrest-js";

interface FlatNode {
  id: number | string;
  node_type: string;
  level_code?: string;
  node_name?: string;
  company_name?: string;
  hierarchy_level?: number;
  parent_id?: number | string;
  [key: string]: unknown;
}

interface TreeNode {
  id: number | string;
  company_name: string;
  node_name: string;
  node_type: string;
  level_code: string;
  children: TreeNode[];
  [key: string]: unknown;
}

export function buildInletOrgTree(flatNodes: FlatNode[]): TreeNode[] {
  if (!Array.isArray(flatNodes)) return [];

  const treeNodeMap = new Map<string, TreeNode>();
  const rootNodes: TreeNode[] = [];

  flatNodes.forEach((node) => {
    const levelCode = (node.level_code || "").replace(/\/$/, "");
    const parts = levelCode.split("/").filter(Boolean);

    if (node.node_type === "项目公司" && parts.length >= 3) {
      let currentPath = "";
      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLeaf = index === parts.length - 1;

        if (!treeNodeMap.has(currentPath)) {
          const treeNode: TreeNode = {
            id: isLeaf ? node.id : `virtual_${currentPath}`,
            company_name: part,
            node_name: part,
            node_type: index === 0
              ? "根节点"
              : index === 1
              ? "区域中心"
              : node.node_type,
            level_code: currentPath,
            children: [],
          };
          treeNodeMap.set(currentPath, treeNode);

          if (index === 0) {
            rootNodes.push(treeNode);
          } else {
            const parentPath = parts.slice(0, index).join("/");
            const parentNode = treeNodeMap.get(parentPath);
            if (parentNode) {
              parentNode.children.push(treeNode);
            }
          }
        }
      });
    } else if (["项目", "进水口", "进水企业"].includes(node.node_type)) {
      const treeNode: TreeNode = {
        id: node.id,
        company_name: node.node_name || node.company_name || "",
        node_name: node.node_name || node.company_name || "",
        node_type: node.node_type,
        level_code: levelCode,
        children: [],
      };
      treeNodeMap.set(levelCode, treeNode);
    }
  });

  flatNodes.forEach((node) => {
    const levelCode = (node.level_code || "").replace(/\/$/, "");

    if (["项目", "进水口", "进水企业"].includes(node.node_type)) {
      const treeNode = treeNodeMap.get(levelCode);
      if (!treeNode) return;

      const lastSlashIndex = levelCode.lastIndexOf("/");
      if (lastSlashIndex > 0) {
        const parentCode = levelCode.substring(0, lastSlashIndex);
        const parentNode = treeNodeMap.get(parentCode);
        if (parentNode) {
          parentNode.children.push(treeNode);
        }
      }
    }
  });

  return rootNodes;
}

export async function getInletOrgTree(
  client: PostgrestClient,
): Promise<TreeNode[]> {
  const { data: flatNodes, error } = await client
    .schema("ia_csc")
    .from("v_inlet_plant_org_tree")
    .select("*")
    .order("hierarchy_level", { ascending: true })
    .order("parent_id", { ascending: true });

  if (error) {
    throw new Error(`Failed to query inlet plant org tree: ${error.message}`);
  }

  return buildInletOrgTree(flatNodes ?? []);
}
