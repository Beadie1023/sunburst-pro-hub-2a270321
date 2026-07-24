import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, AlertTriangle, PackageX, PackageCheck, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/products")({
 component: AdminProductsPage,
});

interface Product {
 id: string;
 name: string;
 sku: string;
 brand: string | null;
 category: string;
 stock_quantity: number;
 status: string;
 price: number | null;
}

function AdminProductsPage " {
 const [products, setProducts] = useState<Product>();
 const [loading, setLoading] = useState(true);
 const [q, setQ] = useState("");
 const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
 const [deleting, setDeleting] = useState(false);

 const load = =>
 supabase
 .from("products")
 .select("*")
 .order("category")
 .order("name")
 .then(({ data }) => {
 setProducts((data ?? ) as Product);
 setLoading(false);
 });

 useEffect( => { load; }, );

 const updatePrice = async (id: string, price: number | null) => {
 const { error } = await supabase.from("products").update({ price }).eq("id", id);
 if (error) toast.error(error.message);
 else toast.success("Price updated");
 };

 const updateStock = async (id: string, stock_quantity: number) => {
 const status = stock_quantity <= 0 ? "Out of Stock" : stock_quantity < 10 ? "Low Stock" : "In Stock";
 const { error } = await supabase.from("products").update({ stock_quantity, status }).eq("id", id);
 if (error) return toast.error(error.message);
 toast.success("Stock updated");
 setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, stock_quantity, status } : p)));
 };

 const confirmDelete = async => {
 if (!deleteTarget) return;
 setDeleting(true);
 const { error } = await supabase.from("products").delete.eq("id", deleteTarget.id);
 setDeleting(false);
 if (error) {
 toast.error(error.message);
 } else {
 toast.success(`${deleteTarget.name} deleted`);
 setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
 setDeleteTarget(null);
 }
 };

 const filtered = products.filter(
 (p) => q === "" || p.name.toLowerCase.includes(q.toLowerCase) || p.sku.includes(q),
 );

 const stats = useMemo( => ({
 total: products.length,
 inStock: products.filter((p) => p.status === "In Stock").length,
 low: products.filter((p) => p.status === "Low Stock").length,
 out: products.filter((p) => p.status === "Out of Stock").length,
 }) [products]);

 return (
 <div className="space-y-5">
 <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
 <div>
 <h1 className="text-3xl font-bold text-primary">Products</h1>
 <p className="text-muted-foreground">{products.length} items · click a value to edit</p>
 </div>
 <div className="relative md:w-72">
 <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
 <Input
 placeholder="Search by name or SKU..."
 value={q}
 onChange={(e) => setQ(e.target.value)}
 className="pl-9"
 />
 </div>
 </div>

 <div className="grid gap-3 sm:grid-cols-3">
 <Card className="flex items-center gap-3 p-4">
 <div className="flex h-10 w-10 items-center justify-center rounded-md bg-success/15 text-success">
 <PackageCheck className="h-5 w-5" />
 </div>
 <div>
 <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">In Stock</div>
 <div className="text-xl font-bold text-primary">{stats.inStock}</div>
 </div>
 </Card>
 <Card className="flex items-center gap-3 p-4">
 <div className="flex h-10 w-10 items-center justify-center rounded-md bg-warning/20 text-warning-foreground">
 <AlertTriangle className="h-5 w-5" />
 </div>
 <div>
 <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Low Stock</div>
 <div className="text-xl font-bold text-primary">{stats.low}</div>
 </div>
 </Card>
 <Card className="flex items-center gap-3 p-4">
 <div className="flex h-10 w-10 items-center justify-center rounded-md bg-destructive/15 text-destructive">
 <PackageX className="h-5 w-5" />
 </div>
 <div>
 <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Out of Stock</div>
 <div className="text-xl font-bold text-primary">{stats.out}</div>
 </div>
 </Card>
 </div>

 <Card className="overflow-hidden">
 {loading ? (
 <div className="flex justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-accent" />
 </div>
 ) : (
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>SKU</TableHead>
 <TableHead>Name</TableHead>
 <TableHead>Category</TableHead>
 <TableHead>Brand</TableHead>
 <TableHead>Stock</TableHead>
 <TableHead>Status</TableHead>
 <TableHead className="text-right">Price ($)</TableHead>
 <TableHead className="w-10" />
 </TableRow>
 </TableHeader>
 <TableBody>
 {filtered.map((p) => (
 <TableRow key={p.id}>
 <TableCell className="font-mono text-xs">{p.sku}</TableCell>
 <TableCell className="font-medium">{p.name}</TableCell>
 <TableCell>{p.category}</TableCell>
 <TableCell className="text-sm">{p.brand ?? "-"}</TableCell>
 <TableCell>
 <Input
 type="number"
 min="0"
 defaultValue={p.stock_quantity}
 className="h-8 w-20"
 onBlur={(e) => {
 const v = Number(e.target.value);
 if (!Number.isNaN(v) && v !== p.stock_quantity) updateStock(p.id, v);
 }}
 />
 </TableCell>
 <TableCell>
 <Badge variant={p.status === "Out of Stock" ? "destructive" : p.status === "Low Stock" ? "secondary" : "default"}>
 {p.status}
 </Badge>
 </TableCell>
 <TableCell className="text-right">
 <Input
 type="number"
 step="0.01"
 min="0"
 defaultValue={p.price ?? ""}
 placeholder="-"
 className="ml-auto h-8 w-24 text-right"
 onBlur={(e) => {
 const v = e.target.value === "" ? null : Number(e.target.value);
 if (v !== p.price) updatePrice(p.id, v);
 }}
 />
 </TableCell>
 <TableCell>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 text-muted-foreground hover:text-destructive"
 onClick={ => setDeleteTarget(p)}
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 )}
 </Card>

 <AlertDialog
 open={!!deleteTarget}
 onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
 >
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>Delete product?</AlertDialogTitle>
 <AlertDialogDescription>
 This permanently deletes <strong>{deleteTarget?.name}</strong> (SKU: {deleteTarget?.sku}). This action cannot be undone.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancel</AlertDialogCancel>
 <AlertDialogAction
 className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
 onClick={confirmDelete}
 disabled={deleting}
 >
 {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 );
}
