class UserSerializer < Blueprinter::Base
  identifier :id

  fields :email_address, :role, :created_at
end
