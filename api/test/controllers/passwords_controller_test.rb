require "test_helper"

class Api::V1::PasswordsControllerTest < ActionDispatch::IntegrationTest
  setup { @user = users(:one) }

  test "create always returns 200 for known email" do
    assert_enqueued_email_with PasswordsMailer, :reset, args: [ @user ] do
      post api_v1_passwords_path, params: { email_address: @user.email_address }, as: :json
    end
    assert_response :ok
    assert response.parsed_body["message"].present?
  end

  test "create returns 200 for unknown email without sending mail" do
    assert_enqueued_emails 0 do
      post api_v1_passwords_path, params: { email_address: "nobody@example.com" }, as: :json
    end
    assert_response :ok
  end

  test "update resets password with valid token" do
    token = @user.password_reset_token

    assert_changes -> { @user.reload.password_digest } do
      patch api_v1_password_path(token),
            params: { password: "newpassword12345", password_confirmation: "newpassword12345" },
            as: :json
    end
    assert_response :ok
    assert response.parsed_body["message"].present?
  end

  test "update returns error with mismatched passwords" do
    token = @user.password_reset_token

    assert_no_changes -> { @user.reload.password_digest } do
      patch api_v1_password_path(token),
            params: { password: "newpassword12345", password_confirmation: "different123456" },
            as: :json
    end
    assert_response :unprocessable_entity
  end

  test "update returns error with invalid token" do
    patch api_v1_password_path("invalid-token"),
          params: { password: "newpassword12345", password_confirmation: "newpassword12345" },
          as: :json
    assert_response :unprocessable_entity
  end
end
