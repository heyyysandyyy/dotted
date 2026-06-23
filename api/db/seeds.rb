admin = User.find_or_create_by(email_address: "admin@example.com") do |u|
  u.password = "password123456"
  u.password_confirmation = "password123456"
  u.role = :admin
end

puts "Admin: #{admin.email_address} (#{admin.new_record? ? 'failed to create' : 'ready'})"
