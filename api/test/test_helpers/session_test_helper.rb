module SessionTestHelper
  def sign_in_as(user)
    session = user.sessions.create!(token: SecureRandom.urlsafe_base64(32))
    Current.session = session
    session
  end

  def auth_headers(session)
    { "Authorization" => "Bearer #{session.token}" }
  end
end

ActiveSupport.on_load(:action_dispatch_integration_test) do
  include SessionTestHelper
end
