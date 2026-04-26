# Security Specification: BoliControl Pro

## Data Invariants
- An ingredient must have a valid unit and positive cost.
- A recipe must have at least one ingredient.
- A production batch must reference a valid recipe.
- A sale must have at least one item and a positive total.
- Finished product stock cannot be negative.
- Users must have a role assigned in the `/users` collection to perform sensitive actions.

## Identity & Roles
- `Admin`: Full access.
- `Production`: Can manage ingredients, recipes, and productions. Read-only for sales.
- `Ventas`: Can manage sales and customers. Read-only for inventory.

## The Dirty Dozen (Test Matrix)
1. Unauthorized user tries to read ingredients -> Denied.
2. Production user tries to delete a sale -> Denied.
3. Sales user tries to create a recipe -> Denied.
4. User tries to set themselves as Admin without being invited -> Denied.
5. Negative stock update -> Denied.
6. Ingredient without name -> Denied.
7. Deleting a production batch by anyone other than Admin -> Denied.
8. Accessing PII of customers by unauthorized roles -> Denied.
9. Modifying `costTotal` of a production batch after creation -> Restricted.
10. Creating a sale for a non-existent customer -> Denied.
11. Bypassing `reorderPoint` alerts -> (Rules don't block alert triggers, but protect data).
12. Injecting malicious scripts in flavor names -> Sanitized via size and regex checks.
