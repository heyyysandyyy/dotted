require "test_helper"

class Api::V1::SessionsControllerTest < ActionDispatch::IntegrationTest
  setup { @user = users(:one) }

  test "show restores session from cookie" do
    post api_v1_session_path, params: { email_address: @user.email_address, password: "password" },
                              as: :json
    token = response.parsed_body["token"]

    get api_v1_session_path
    assert_response :ok
    assert_equal token, response.parsed_body["token"]
    assert_equal @user.id, response.parsed_body["user"]["id"]
  end

  test "show returns unauthorized without cookie" do
    get api_v1_session_path
    assert_response :unauthorized
  end

  test "create returns token and user with valid credentials" do
    post api_v1_session_path, params: { email_address: @user.email_address, password: "password" },
                              as: :json
    assert_response :created
    json = response.parsed_body
    assert json["token"].present?
    assert_equal @user.email_address, json["user"]["email_address"]
  end

  test "create returns unauthorized with invalid password" do
    post api_v1_session_path, params: { email_address: @user.email_address, password: "wrong" },
                              as: :json
    assert_response :unauthorized
  end

  test "destroy ends session" do
    session_record = sign_in_as(@user)

    delete api_v1_session_path, headers: auth_headers(session_record)
    assert_response :no_content
    assert_not Session.exists?(session_record.id)
  end
end
