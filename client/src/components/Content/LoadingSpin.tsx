import { LoadingOutlined } from '@ant-design/icons';
import { Spin } from 'antd';
import React from 'react';

const LoadingSpin = (): React.JSX.Element => (
  <Spin indicator={<LoadingOutlined spin />} size="large" />
);

export default React.memo(LoadingSpin);
