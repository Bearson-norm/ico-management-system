import xmlrpc.client

url = 'https://foomx.odoo.com'
db = 'foom-production-5808833'
uid = 34
password = 'Password123'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# 1. Search PR04276 in purchase.request
pr_ids = models.execute_kw(db, uid, password, 'purchase.request', 'search', [[['name', '=', 'PR04276']]])
print(f"PR04276 ID: {pr_ids}")

if pr_ids:
    pr_lines = models.execute_kw(db, uid, password, 'purchase.request.line', 'search_read', [[['request_id', '=', pr_ids[0]]]], {'fields': ['name', 'product_id', 'product_qty']})
    print("PR Lines:", pr_lines)

# 2. Search P14032 in purchase.order
po_ids = models.execute_kw(db, uid, password, 'purchase.order', 'search', [[['name', '=', 'P14032']]])
print(f"P14032 ID: {po_ids}")

if po_ids:
    po_lines = models.execute_kw(db, uid, password, 'purchase.order.line', 'search_read', [[['order_id', '=', po_ids[0]]]], {'fields': ['name', 'product_id', 'product_qty', 'price_unit', 'price_total']})
    print("PO Lines:", po_lines)
