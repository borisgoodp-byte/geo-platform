export type Role = "client" | "operator" | "lead";

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
  /** lead 恒为 []，表示全部项目 */
  projectIds: number[];
};
